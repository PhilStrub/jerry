import {
  type Message,
  type MessagePart,
  type DBMessage,
} from "./db/schema";
import { nanoid } from "nanoid";

type AIMessage = {
  role: string;
  content: string | any[];
  id?: string;
  parts?: MessagePart[];
};

type UIMessage = {
  id: string;
  role: string;
  content: string;
  parts: MessagePart[];
  htmlResources?: string;
  createdAt?: Date;
};

// Helper function to check if a tool result contains UI resources
function hasUIResources(result: any): boolean {
  if (!result) return false;
  
  // Check for direct UI resource
  if (result && typeof result === 'object' && result.type === 'resource' && result.uri?.startsWith('ui://')) {
    return true;
  }
  
  // Check for stringified result with UI resource
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (parsed && parsed.type === 'resource' && parsed.uri?.startsWith('ui://')) {
        return true;
      }
      // Check content array in parsed result
      if (parsed && parsed.content && Array.isArray(parsed.content)) {
        return parsed.content.some((item: any) => 
          (item.type === 'resource' && item.resource?.uri?.startsWith('ui://')) ||
          (item.type === 'resource' && item.uri?.startsWith('ui://')) ||
          (item.type === 'text' && item.text && hasUIResourceInText(item.text))
        );
      }
    } catch {
      // Not JSON, continue
    }
  }
  
  // Check for content array with UI resources
  if (result && result.content && Array.isArray(result.content)) {
    return result.content.some((item: any) => 
      (item.type === 'resource' && item.resource?.uri?.startsWith('ui://')) ||
      (item.type === 'resource' && item.uri?.startsWith('ui://')) ||
      (item.type === 'text' && item.text && hasUIResourceInText(item.text))
    );
  }
  
  return false;
}

// Helper to check if text contains a UI resource
function hasUIResourceInText(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return parsed && parsed.type === 'resource' && parsed.uri?.startsWith('ui://');
  } catch {
    return false;
  }
}


// Function to convert AI messages to DB format
export function convertToDBMessages(
  aiMessages: AIMessage[],
  chatId: string,
  htmlResources?: string | null
): DBMessage[] {
  return aiMessages.map((msg) => {
    // Use existing id or generate a new one
    const messageId = msg.id || nanoid();

    // If msg has parts, process them to ensure they're properly structured
    if (msg.parts) {
      const processedParts = msg.parts.map((part: any) => {
        // Ensure all parts have the correct structure for database storage
        const processedPart: MessagePart = {
          type: part.type,
          ...part
        };

        // Handle tool invocation parts specifically
        if (part.type === "tool-invocation" && part.toolInvocation) {
          processedPart.toolInvocation = {
            toolName: part.toolInvocation.toolName,
            state: part.toolInvocation.state,
            args: part.toolInvocation.args,
            ...(part.toolInvocation.result && { result: part.toolInvocation.result })
          };
        }

        // Handle reasoning parts
        if (part.type === "reasoning") {
          processedPart.reasoning = part.reasoning;
          if (part.details) {
            processedPart.details = part.details;
          }
        }

        // Handle resource/artifact parts
        if (part.type === "resource" && part.resource) {
          processedPart.resource = part.resource;
        }

        return processedPart;
      });

      // Check if this message should get HTML resources (assistant messages with tool invocations that produce UI resources)
      const shouldIncludeResources = msg.role === 'assistant' && 
        htmlResources && 
        processedParts.some(part => 
          part.type === 'tool-invocation' && 
          part.toolInvocation?.result &&
          hasUIResources(part.toolInvocation.result)
        );

      console.log('[CHAT STORE] Message conversion:', {
        messageId,
        role: msg.role,
        hasHtmlResources: !!htmlResources,
        htmlResourcesLength: htmlResources?.length,
        shouldIncludeResources,
        partsCount: processedParts.length
      });

      return {
        id: messageId,
        chatId,
        role: msg.role,
        parts: processedParts,
        htmlResources: shouldIncludeResources ? htmlResources : undefined,
        createdAt: new Date(),
      };
    }

    // Otherwise, convert content to parts
    let parts: MessagePart[];

    if (typeof msg.content === "string") {
      parts = [{ type: "text", text: msg.content }];
    } else if (Array.isArray(msg.content)) {
      if (
        msg.content.every((item) => typeof item === "object" && item !== null)
      ) {
        // Content is already in parts-like format
        parts = msg.content as MessagePart[];
      } else {
        // Content is an array but not in parts format
        parts = [{ type: "text", text: JSON.stringify(msg.content) }];
      }
    } else {
      // Default case
      parts = [{ type: "text", text: String(msg.content) }];
    }

    // Check if this message should get HTML resources (assistant messages with tool invocations that produce UI resources)
    const shouldIncludeResources = msg.role === 'assistant' && 
      htmlResources && 
      parts.some(part => 
        part.type === 'tool-invocation' && 
        (part as any).toolInvocation?.result &&
        hasUIResources((part as any).toolInvocation.result)
      );

    return {
      id: messageId,
      chatId,
      role: msg.role,
      parts,
      htmlResources: shouldIncludeResources ? htmlResources : undefined,
      createdAt: new Date(),
    };
  });
}

// Convert DB messages to UI format
export function convertToUIMessages(
  dbMessages: Array<Message>
): Array<UIMessage> {
  return dbMessages.map((message) => {
    const parts = message.parts as MessagePart[];
    
    // Ensure parts maintain their structure for UI components
    const processedParts = parts.map((part) => {
      // Parts are already properly structured from the database
      // but we may need to ensure compatibility with UI components
      return {
        ...part,
        // Ensure tool invocations maintain their structure
        ...(part.type === "tool-invocation" && part.toolInvocation && {
          toolInvocation: part.toolInvocation
        }),
        // Ensure reasoning parts maintain their structure
        ...(part.type === "reasoning" && {
          reasoning: part.reasoning,
          details: part.details
        }),
        // Ensure resource parts maintain their structure
        ...(part.type === "resource" && part.resource && {
          resource: part.resource
        })
      };
    });

    // Get text content and ensure it's always a string
    let contentText = getTextContent(message);
    
    // For tool messages or messages with tool results, create appropriate content
    if (message.role === 'tool') {
      // For tool messages, we need to extract the tool result content
      const toolResultParts = parts.filter(part => part.type === 'tool-result');
      if (toolResultParts.length > 0) {
        contentText = toolResultParts.map(part => {
          if ((part as any).result) {
            return typeof (part as any).result === 'string' ? (part as any).result : JSON.stringify((part as any).result);
          }
          return '';
        }).join('\n');
      }
    }
    
    // Ensure content is always a non-empty string
    if (!contentText || typeof contentText !== 'string') {
      contentText = message.role === 'tool' ? 'Tool result' : 'Message content';
    }

    console.log('[CHAT STORE] Converting DB message:', {
      id: message.id,
      role: message.role,
      contentLength: contentText.length,
      contentType: typeof contentText,
      partsCount: processedParts.length,
      contentPreview: contentText.substring(0, 50)
    });

    return {
      id: message.id,
      parts: processedParts,
      role: message.role as string,
      content: contentText,
      htmlResources: (message as any).htmlResources || undefined,
      createdAt: message.createdAt,
    };
  });
}

export function generateChatTitle(aiMessages: AIMessage[]): string {
  // Generate title if messages are provided
  if (aiMessages && aiMessages.length > 0) {
    const hasEnoughMessages =
      aiMessages.length >= 2 &&
      aiMessages.some((m) => m.role === "user") &&
      aiMessages.some((m) => m.role === "assistant");

    if (hasEnoughMessages) {
      // Fallback to basic title extraction if AI title generation fails
      const firstUserMessage = aiMessages.find((m) => m.role === "user");
      if (firstUserMessage) {
        // Check for parts first (new format)
        if (firstUserMessage.parts && Array.isArray(firstUserMessage.parts)) {
          const textParts = firstUserMessage.parts.filter(
            (p: MessagePart) => p.type === "text" && p.text
          );
          if (textParts.length > 0) {
            let title = textParts[0].text?.slice(0, 50) || "New Chat";
            if ((textParts[0].text?.length || 0) > 50) {
              title += "...";
            }
            return title;
          } else {
            // If no text parts but has tool invocation, use tool name for title
            const toolParts = firstUserMessage.parts.filter(
              (p: MessagePart) => p.type === "tool-invocation" && p.toolInvocation?.toolName
            );
            if (toolParts.length > 0) {
              return `Tool: ${toolParts[0].toolInvocation?.toolName}`;
            }
            return "New Chat";
          }
        }
        else {
          return "New Chat";
        }
      } else {
        return "New Chat";
      }
    } else {
      // Not enough messages for AI title, use first message
      const firstUserMessage = aiMessages.find((m) => m.role === "user");
      if (firstUserMessage) {
        // Check for parts first (new format)
        if (firstUserMessage.parts && Array.isArray(firstUserMessage.parts)) {
          const textParts = firstUserMessage.parts.filter(
            (p: MessagePart) => p.type === "text" && p.text
          );
          if (textParts.length > 0) {
            let title = textParts[0].text?.slice(0, 50) || "New Chat";
            if ((textParts[0].text?.length || 0) > 50) {
              title += "...";
            }
            return title;
          } else {
            // If no text parts but has tool invocation, use tool name for title
            const toolParts = firstUserMessage.parts.filter(
              (p: MessagePart) => p.type === "tool-invocation" && p.toolInvocation?.toolName
            );
            if (toolParts.length > 0) {
              return `Tool: ${toolParts[0].toolInvocation?.toolName}`;
            }
            return "New Chat";
          }
        }
        else {
          return "New Chat";
        }
      } else {
        return "New Chat";
      }
    }
  } else {
    return "New Chat";
  }
}

// Helper to get just the text content for display
export function getTextContent(message: Message): string {
  try {
    const parts = message.parts as MessagePart[];
    return parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
  } catch (e) {
    // If parsing fails, return empty string
    return "";
  }
}

// These functions are now server-side only and should be called via API routes
