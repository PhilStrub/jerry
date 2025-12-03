"use client";

import { defaultModel, type modelID } from "@/ai/providers";
import { Message, useChat } from "@ai-sdk/react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Textarea } from "./textarea";
import { ProjectOverview } from "./project-overview";
import { Messages } from "./messages";
import { toast } from "sonner";
import { useRouter, useParams } from "next/navigation";
import { getUserId } from "@/lib/user-id";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convertToUIMessages } from "@/lib/chat-store";
import { type Message as DBMessage } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { useMCP } from "@/lib/context/mcp-context";
import { useArtifact } from "@/lib/context/artifact-context";

// Type for chat data from DB
interface ChatData {
  id: string;
  messages: DBMessage[];
  createdAt: string;
  updatedAt: string;
}

export default function Chat() {
  const router = useRouter();
  const params = useParams();
  const chatId = params?.id as string | undefined;
  const queryClient = useQueryClient();
  
  const [selectedModel, setSelectedModel] = useLocalStorage<modelID>("selectedModel", defaultModel);
  const [generatedChatId, setGeneratedChatId] = useState<string>('');

  // Get MCP server data from context
  const { mcpServersForApi } = useMCP();
  
  // Get artifact context
  const { setCurrentMessageId } = useArtifact();
  
  // Initialize userId immediately
  const [userId, setUserId] = useState<string>('');
  
  // Ensure userId is set on client mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const id = getUserId();
      setUserId(id);
    }
  }, []);
  
  // Generate a chat ID if needed
  useEffect(() => {
    if (!chatId) {
      setGeneratedChatId(nanoid());
    }
  }, [chatId]);
  
  // Use React Query to fetch chat history
  const { data: chatData, isLoading: isLoadingChat, error } = useQuery({
    queryKey: ['chat', chatId, userId] as const,
    enabled: !!chatId && !!userId, // Only fetch if we have a real chatId from URL, not generated
    queryFn: async ({ queryKey }) => {
      const [_, currentChatId, userId] = queryKey;
      
      if (!currentChatId || !userId) {
        return null;
      }
      const response = await fetch(`/api/chats/${currentChatId}`, {
        headers: {
          'x-user-id': userId
        }
      });
      
      if (!response.ok) {
        // For 404, return empty chat data instead of throwing
        if (response.status === 404) {
          return { id: currentChatId, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        }
        throw new Error('Failed to load chat');
      }
      
      return response.json() as Promise<ChatData>;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false
  });
  
  // Handle query errors
  useEffect(() => {
    if (error) {
      console.error('Error loading chat history:', error);
      toast.error('Failed to load chat history');
    }
  }, [error]);
  
  // Prepare initial messages from query data - simple format for AI SDK
  const initialMessages = useMemo(() => {
    if (!chatData || !chatData.messages || chatData.messages.length === 0) {
      return [];
    }
    
    // Convert DB messages to AI SDK compatible format
    const uiMessages = convertToUIMessages(chatData.messages);
    return uiMessages.map(msg => {
      // For AI SDK compatibility, only include id, role, and content as string
      // Do NOT include parts - AI SDK handles this internally
      const aiMessage: Message = {
        id: msg.id,
        role: msg.role as Message['role'],
        content: msg.content, // This is now guaranteed to be a string from convertToUIMessages
      };
      
      return aiMessage;
    });
  }, [chatData]);

  // Prepare display messages - rich format with parts for UI components
  const dbDisplayMessages = useMemo(() => {
    if (!chatData || !chatData.messages || chatData.messages.length === 0) {
      return [];
    }
    
    // Convert DB messages to UI format with full parts structure
    const uiMessages = convertToUIMessages(chatData.messages);
    return uiMessages.map(msg => {
      // Convert UI message format to AI SDK Message format but keep parts
      const displayMessage: Message = {
        id: msg.id,
        role: msg.role as Message['role'],
        content: msg.content,
        parts: msg.parts as any, // Cast to any to bypass strict type checking - parts are handled by Message component
      };
      
      // Add htmlResources if available
      if (msg.htmlResources) {
        (displayMessage as any).htmlResources = msg.htmlResources;
      }
      
      // Preserve createdAt for sorting
      if (msg.createdAt) {
        (displayMessage as any).createdAt = msg.createdAt;
      }
      
      return displayMessage;
    });
  }, [chatData]);

  // Auto-load latest artifact when chat is loaded
  useEffect(() => {
    const loadLatestArtifact = async () => {
      if (!chatId || !userId) return;
      
      try {
        const response = await fetch(`/api/artifact/latest?chatId=${chatId}`, {
          headers: {
            'x-user-id': userId
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.messageId) {
            setCurrentMessageId(result.messageId);
          }
        }
      } catch (error) {
        console.log('No artifacts found for this chat:', error);
      }
    };
    
    loadLatestArtifact();
  }, [chatId, userId, setCurrentMessageId]);
  
  // Only initialize useChat when we have userId and either chatId or generatedChatId
  // Also ensure we don't initialize if we're still loading chat data for existing chats
  // Add check for MCP servers to be ready as well to prevent race conditions
  const shouldInitializeChat = Boolean(
    userId && 
    (chatId || generatedChatId) && 
    (!chatId || !isLoadingChat) &&
    // Ensure MCP servers are initialized (can be empty array, but should be defined)
    mcpServersForApi !== undefined
  );
  
  const { messages, input, handleInputChange, handleSubmit, status, stop, append } =
    useChat({
      id: shouldInitializeChat ? (chatId || generatedChatId) : undefined,
      initialMessages: shouldInitializeChat ? initialMessages : [],
      maxSteps: 20,
      body: shouldInitializeChat ? {
        selectedModel,
        mcpServers: mcpServersForApi,
        chatId: chatId || generatedChatId,
        userId,
      } : undefined,
      experimental_throttle: 100,
      onFinish: () => {
        // Invalidate the chats query to refresh the sidebar
        if (userId) {
          queryClient.invalidateQueries({ queryKey: ['chats', userId] });
        }
      },
      onError: (error) => {

        // Enhanced error logging for debugging
        console.error('Chat error - Full details:', {
          message: error.message,
          stack: error.stack,
          cause: error.cause,
          name: error.name,
          fullError: error,
          selectedModel,
          mcpServersCount: mcpServersForApi?.length || 0,
          timestamp: new Date().toISOString()
        });

        // Extract more specific error information
        let userMessage = "An error occurred, please try again later.";
        const technicalDetails = error.message;

        // Check for API-specific errors with actionable guidance
        if (error.message) {
          if (error.message.includes('API key')) {
            userMessage = selectedModel?.includes('gemini') 
              ? "Google API key issue. Please configure your GOOGLE_GENERATIVE_AI_API_KEY in settings."
              : "API key issue detected. Please check your API key configuration in settings.";
          } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
            userMessage = selectedModel?.includes('gemini')
              ? "Gemini API rate limit exceeded. Please wait a few minutes or check your API quota."
              : "Rate limit exceeded. Please wait a moment and try again.";
          } else if (error.message.includes('model') || error.message.includes('not found')) {
            userMessage = `Model "${selectedModel}" may be unavailable. Try switching to Claude 4 Sonnet or check if the model is properly configured.`;
          } else if (error.message.includes('network') || error.message.includes('fetch')) {
            userMessage = "Network error. Please check your connection and try again.";
          } else if (error.message.includes('401') || error.message.includes('unauthorized')) {
            userMessage = selectedModel?.includes('gemini')
              ? "Unauthorized access to Gemini API. Please verify your Google API key is valid and has the correct permissions."
              : "API authentication failed. Please verify your API key is correct.";
          } else if (error.message.includes('403') || error.message.includes('forbidden')) {
            userMessage = selectedModel?.includes('gemini')
              ? "Access forbidden to Gemini API. Check if your API key has access to Gemini 2.5 Pro or if there are regional restrictions."
              : "API access denied. Your API key may not have the required permissions.";
          } else if (error.message.includes('500') || error.message.includes('internal server')) {
            userMessage = selectedModel?.includes('gemini')
              ? "Gemini API server error. Google's servers may be experiencing issues. Please try again later."
              : "Server error occurred. Please try again in a few moments.";
          } else if (error.message.length > 0) {
            userMessage = error.message;
          }
        }

        // Log technical details for debugging
        console.error('Technical details for user:', technicalDetails);

        toast.error(userMessage, { 
          position: "top-center", 
          richColors: true,
          description: process.env.NODE_ENV === 'development' ? `Model: ${selectedModel}` : undefined
        });
      },
    });

  // Combine DB messages (with parts) and live useChat messages for display
  const displayMessages = useMemo(() => {
    // If we have database messages, use them as the primary source of truth for old content
    if (dbDisplayMessages.length > 0) {
      // Find messages from useChat that are genuinely new (higher message count means new messages)
      // This is more reliable than ID matching since AI SDK might change IDs
      const newMessages = messages.length > dbDisplayMessages.length 
        ? messages.slice(dbDisplayMessages.length) // Take only the new messages at the end
        : [];
      
      // Combine database messages (in correct order) with new messages
      return [...dbDisplayMessages, ...newMessages];
    }
    
    // If no database messages, use live messages directly
    return messages;
  }, [dbDisplayMessages, messages]);

  // Add postMessage listener for toolbar messages
  useEffect(() => {
    const handlePostMessage = (event: MessageEvent) => {
      // Only process messages that are specifically from our toolbar
      // and have the exact structure we expect
      if (!event.data || 
          event.data.type !== 'user_message' || 
          !event.data.payload || 
          !event.data.payload.content ||
          !event.data.payload.transaction_id) {
        // Silently ignore messages that aren't from our toolbar
        return;
      }

      
      // More permissive origin check for debugging - allow localhost with any port
      const isValidOrigin = event.origin === window.location.origin || 
                           event.origin.includes('localhost') || 
                           event.origin.includes('127.0.0.1') ||
                           event.origin === 'null'; // For file:// or iframe contexts
      
      if (!isValidOrigin) {
        return;
      }
      
      if (!append) {
        console.error('append function not available when processing toolbar user_message');
        return;
      }

      
      try {
        // If updated HTML is provided, save it to the database
        if (event.data.payload.updated_html && chatId) {
          console.log('[CHAT] Saving updated HTML to database for chat:', chatId);
          console.log('[CHAT] Updated HTML length:', event.data.payload.updated_html.length);
          console.log('[CHAT] Transaction ID:', event.data.payload.transaction_id);
          
          fetch('/api/update-html', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chatId: chatId,
              transactionId: event.data.payload.transaction_id,
              updatedHtml: event.data.payload.updated_html,
            }),
          })
          .then(response => {
            console.log('[CHAT] Update-html response status:', response.status);
            return response.json();
          })
          .then(result => {
            console.log('[CHAT] Update-html result:', result);
            if (result.success) {
              console.log('[CHAT] Successfully updated HTML in database for message:', result.messageId);
            } else {
              console.error('[CHAT] Failed to update HTML in database:', result.error);
            }
          })
          .catch(error => {
            console.error('[CHAT] Error calling update-html API:', error);
          });
        } else {
          console.log('[CHAT] Not saving HTML - missing data:', {
            hasUpdatedHtml: !!event.data.payload.updated_html,
            hasChatId: !!chatId,
            chatId: chatId
          });
        }
        
        const newMessage: Message = {
          id: nanoid(),
          role: 'user',
          content: event.data.payload.content,
        };
        
        // Add a small delay to ensure the message is processed after any ongoing operations
        setTimeout(() => {
          append(newMessage);
        }, 100);
        
      } catch (error) {
        console.error('Error creating or appending toolbar message:', error);
      }
    };

    window.addEventListener('message', handlePostMessage);
    
    return () => {
      window.removeEventListener('message', handlePostMessage);
    };
  }, [append]);
    
  // Custom submit handler
  const handleFormSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Don't submit if userId is not available yet or chat is not initialized
    if (!userId || !shouldInitializeChat) {
      toast.error('Please wait for initialization to complete');
      return;
    }
    
    // Don't submit if handleSubmit is not available
    if (!handleSubmit) {
      toast.error('Chat is not ready yet, please try again');
      return;
    }
    
    try {
      if (!chatId && generatedChatId && input.trim()) {
        // If this is a new conversation, redirect to the chat page with the generated ID
        const effectiveChatId = generatedChatId;
        
        // Submit the form
        handleSubmit(e);
        
        // Redirect to the chat page with the generated ID
        router.push(`/chat/${effectiveChatId}`);
      } else {
        // Normal submission for existing chats
        handleSubmit(e);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('Failed to send message, please try again');
    }
  }, [chatId, generatedChatId, input, handleSubmit, router, userId, shouldInitializeChat, mcpServersForApi]);

  const isLoading = status === "streaming" || status === "submitted" || isLoadingChat;

  return (
    <div className="h-dvh flex flex-col justify-center w-full max-w-[430px] sm:max-w-4xl mx-auto px-4 sm:px-6 py-3">
      {displayMessages.length === 0 && !isLoadingChat ? (
        <div className="max-w-2xl mx-auto w-full">
          <ProjectOverview />
          <form
            onSubmit={handleFormSubmit}
            className="mt-4 w-full mx-auto"
          >
            <Textarea
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              handleInputChange={handleInputChange}
              input={input}
              isLoading={isLoading}
              status={status}
              stop={stop}
            />
          </form>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto min-h-0 pb-2">
            <Messages messages={displayMessages} isLoading={isLoading} status={status} />
          </div>
          <form
            onSubmit={handleFormSubmit}
            className="mt-2 w-full mx-auto"
          >
            <Textarea
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              handleInputChange={handleInputChange}
              input={input}
              isLoading={isLoading}
              status={status}
              stop={stop}
            />
          </form>
        </>
      )}
    </div>
  );
}
