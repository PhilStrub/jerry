'use client';

import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2,
  CheckCircle2,
  TerminalSquare,
  Code,
  ArrowRight,
  Circle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UIResourceRenderer, UIActionResult } from '@mcp-ui/client';
import type { UseChatHelpers, Message as TMessage } from 'ai/react';
import { useArtifact } from '@/lib/context/artifact-context';
import { nanoid } from 'nanoid';
import { useMCP } from '@/lib/context/mcp-context';

// Define interfaces for better type safety
interface HtmlResourceData {
  uri: string;
  mimeType: 'text/html';
  text?: string;
  blob?: string;
  [key: string]: any; // Allow other fields, like id from example
}

interface ContentItemWithHtmlResource {
  type: 'resource';
  resource: HtmlResourceData;
}

// Generic content item
interface ContentItem {
  type: string;
  [key: string]: any;
}

// Expected structure of the parsed result string
interface ParsedResultContainer {
  content: ContentItem[];
}

interface ToolInvocationProps {
  toolName: string;
  state: string;
  args: any;
  result: any;
  isLatestMessage: boolean;
  status: string;
  messageId: string;
  append?: UseChatHelpers['append'];
  isFromDatabase?: boolean;
}

export const ToolInvocation = memo(function ToolInvocation({
  toolName,
  state,
  args,
  result,
  isLatestMessage,
  status,
  messageId,
  append,
  isFromDatabase = false,
}: ToolInvocationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [htmlResourceContents, setHtmlResourceContents] = useState<HtmlResourceData[]>([]);
  const [graphVisualizationDetected, setGraphVisualizationDetected] = useState(false);
  const { setCurrentMessageId, setCurrentArtifact, setOnArtifactAction } = useArtifact();
  const { mcpServers } = useMCP();
  
  // Track the last processed result to prevent duplicate processing
  const lastProcessedResultRef = useRef<string | null>(null);

  const handleUiAction = useCallback(
    async (result: UIActionResult) => {
      if (append) {
        let userMessageContent = '';
        if (result.type === 'tool') {
          userMessageContent = `Call ${result.payload.toolName} with parameters: ${JSON.stringify(
            result.payload.params
          )}`;
        }
        if (result.type === 'prompt') {
          userMessageContent = result.payload.prompt;
        }
        if (userMessageContent) {
          const newMessage: TMessage = {
            id: nanoid(),
            role: 'user',
            content: userMessageContent,
          };

          append(newMessage);
        }

        return Promise.resolve({
          status: 'ok',
          message: 'User interaction requested via append',
        });
      } else {
        console.warn('append function not available in ToolInvocation for UI action');
        return Promise.resolve({
          status: 'error',
          message: 'Chat context (append) not available for UI action',
        });
      }
    },
    [append]
  );

  // Function to fetch HTML content from MCP servers
  const fetchHtmlContent = useCallback(async (uri: string): Promise<string | null> => {
    try {
      // Convert MCP servers to the format expected by the API
      const mcpServersForApi = mcpServers
        .filter(server => server.type === 'streamable-http' && server.status === 'connected')
        .map(server => ({
          type: 'streamable-http' as const,
          url: server.url
        }));

      if (mcpServersForApi.length === 0) {
        console.log('[ARTIFACT] No connected MCP servers available');
        return null;
      }

      // Fetch HTML content via server-side endpoint
      const fetchResponse = await fetch('/api/artifact/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri: uri,
          mcpServers: mcpServersForApi
        })
      });

      if (fetchResponse.ok) {
        const { htmlContent } = await fetchResponse.json();
        return htmlContent;
      } else {
        console.log('[ARTIFACT] No HTML content found for URI:', uri);
        return null;
      }
    } catch (error) {
      console.error('[ARTIFACT] Error fetching HTML content for URI:', uri, error);
      return null;
    }
  }, [mcpServers]);

  // NOTE: Background artifact saving removed - chat API now handles per-message HTML extraction

  useEffect(() => {
    // Create a hash of the current result to prevent duplicate processing
    const resultHash = JSON.stringify(result);
    
    // Skip processing if this exact result was already processed
    if (lastProcessedResultRef.current === resultHash) {
      return;
    }
    // Update the processed result reference
    lastProcessedResultRef.current = resultHash;
    
    let processedContainer: ParsedResultContainer | null = null;

    if (result && typeof result === 'object' && result.content && Array.isArray(result.content)) {
      processedContainer = result as ParsedResultContainer;
    } else if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.content &&
          Array.isArray(parsed.content)
        ) {
          processedContainer = parsed as ParsedResultContainer;
        } else if (parsed) {
          console.warn(
            'Parsed string result does not have the expected .content array structure:',
            parsed
          );
        }
      } catch (error) {
        console.error(
          'Failed to parse string result for HtmlResource:',
          error,
          'Input string was:',
          result
        );
        // Error during parsing, clear content
        setHtmlResourceContents((prev) => (prev.length > 0 ? [] : prev));
        return; // Exit effect early
      }
    } else if (result && typeof result === 'object' && result.type === 'resource' && result.uri) {
      // Handle direct resource results (not wrapped in content array)
      if (result.uri === 'ui://graph-visualization') {
        if (!isFromDatabase) {
          // For new messages: Fetch HTML content and show immediately
          console.log('[ARTIFACT] Fetching and showing direct graph visualization immediately');
          fetchHtmlContent(result.uri).then(htmlContent => {
            if (htmlContent) {
              setOnArtifactAction(handleUiAction);
              setCurrentArtifact(messageId, htmlContent);
              setGraphVisualizationDetected(true);
              setHtmlResourceContents([]);
              
              // NOTE: Not saving to DB here - chat API handles per-message HTML extraction
              console.log('[ARTIFACT] Direct graph visualization displayed immediately (not saving - chat API handles this)');
            } else {
              console.error('[ARTIFACT] No HTML content found for direct graph visualization');
            }
          }).catch(error => {
            console.error('[ARTIFACT] Failed to fetch direct graph visualization:', error);
          });
        } else {
          // For historical messages, just show the UI (content comes from DB via custom-artifact-renderer)
          setOnArtifactAction(handleUiAction);
          setCurrentMessageId(messageId);
          setGraphVisualizationDetected(true);
          setHtmlResourceContents([]);
        }
        return;
      } else if (result.uri.startsWith('ui://') && !isFromDatabase) {
        // For other UI resources, just log (chat API handles saving)
        console.log('[ARTIFACT] Found UI resource:', result.uri, '(not saving - chat API handles this)');
      }
    } else if (result !== null && result !== undefined) {
      // Result is not an object, not a string, but also not null/undefined.
      // This case implies an unexpected type for 'result'.
      console.warn('Result has an unexpected type or structure:', result);
      // It's safest to clear content here as well.
      setHtmlResourceContents((prev) => (prev.length > 0 ? [] : prev));
      return; // Exit effect early
    }

    if (processedContainer) {
      try {
        // First, look for direct resource items
        const directResources = processedContainer.content
          .filter(
            (item): item is ContentItemWithHtmlResource =>
              item.type === 'resource' && item.resource && item.resource.uri.startsWith('ui://')
          )
          .map((item) => item.resource);

        // Also look for stringified resources in text content blocks **this is how our python backend returns the resource**
        const textResources = processedContainer.content
          .filter((item) => item.type === 'text' && typeof item.text === 'string')
          .map((item) => {
            try {
              const parsed = JSON.parse(item.text);
              if (parsed && parsed.type === 'resource' && parsed.uri && parsed.uri.startsWith('ui://')) {
                return {
                  uri: parsed.uri,
                  mimeType: (parsed.mimeType || 'text/html') as 'text/html',
                  text: parsed.text,
                } as HtmlResourceData;
              }
              return null;
            } catch {
              return null;
            }
          })
          .filter((item): item is HtmlResourceData => item !== null);

        const newHtmlResources = [...directResources, ...textResources];

        // Check for graph visualization resources
        const graphVisualizationResource = newHtmlResources.find(
          (resource) => resource.uri === 'ui://graph-visualization'
        );

        if (graphVisualizationResource) {
          // Route graph visualization to artifact panel

          if (!isFromDatabase) {
            // For new messages: Fetch HTML content and show immediately
            console.log('[ARTIFACT] Fetching and showing graph visualization immediately');
            
            // Check if we have HTML content in the resource itself
            if (graphVisualizationResource.text) {
              setOnArtifactAction(handleUiAction);
              setCurrentArtifact(messageId, graphVisualizationResource.text);
              setGraphVisualizationDetected(true);
              
              // NOTE: Not saving to DB here - chat API handles per-message HTML extraction
              console.log('[ARTIFACT] HTML content available in resource, displaying immediately (not saving - chat API handles this)');
            } else {
              // Fetch HTML content from MCP servers
              fetchHtmlContent(graphVisualizationResource.uri).then(htmlContent => {
                if (htmlContent) {
                  setOnArtifactAction(handleUiAction);
                  setCurrentArtifact(messageId, htmlContent);
                  setGraphVisualizationDetected(true);
                  
                  // NOTE: Not saving to DB here - chat API handles per-message HTML extraction
                  console.log('[ARTIFACT] HTML content fetched, displaying immediately (not saving - chat API handles this)');
                } else {
                  console.error('[ARTIFACT] No HTML content found for graph visualization');
                }
              }).catch((error: any) => {
                console.error('[ARTIFACT] Failed to fetch graph visualization:', error);
              });
            }
          } else {
            // For historical messages, just show the UI (content comes from DB via custom-artifact-renderer)
            setOnArtifactAction(handleUiAction);
            setCurrentMessageId(messageId);
            setGraphVisualizationDetected(true);
          }

          // Remove graph visualization from inline resources (it will be shown in the artifact panel)
          const inlineResources = newHtmlResources.filter(
            (resource) => resource.uri !== 'ui://graph-visualization'
          );
          setHtmlResourceContents(inlineResources);
        } else {
          setGraphVisualizationDetected(false);
          setOnArtifactAction(undefined);
          setHtmlResourceContents((prevContents) => {
            const newUris = newHtmlResources.map((r) => r.uri).sort();
            const currentUris = prevContents.map((r) => r.uri).sort();

            if (JSON.stringify(newUris) !== JSON.stringify(currentUris)) {
              // Content has actually changed, set it.
              // Also, trigger expansion if new content arrived and we are currently collapsed.
              if (newHtmlResources.length > 0) {
                setIsExpanded((currentExpandedState) => {
                  if (!currentExpandedState) return true; // Expand if not already expanded
                  return currentExpandedState; // Otherwise, keep current state
                });
              }
              return newHtmlResources;
            }
            return prevContents; // No change to htmlResourceContents
          });
        }
      } catch (error) {
        console.error('Error processing content for HtmlResource:', error);
        // Error during processing, clear content
        setHtmlResourceContents((prev) => (prev.length > 0 ? [] : prev));
      }
    } else {
      // Result is null, undefined (implicitly handled by lack of processedContainer),
      // or became null after initial checks (e.g. string parsed to null).
      // Clear content.
      setHtmlResourceContents((prev) => (prev.length > 0 ? [] : prev));
    }
  }, [result]); // Only re-run if result changes - setArtifactContent is stable

  const getStatusIcon = () => {
    if (state === 'call') {
      if (isLatestMessage && status !== 'ready') {
        return <Loader2 className="animate-spin h-3.5 w-3.5 text-primary/70" />;
      }
      return <Circle className="h-3.5 w-3.5 fill-muted-foreground/10 text-muted-foreground/70" />;
    }
    return <CheckCircle2 size={14} className="text-primary/90" />;
  };

  const getStatusClass = () => {
    if (state === 'call') {
      if (isLatestMessage && status !== 'ready') {
        return 'text-primary';
      }
      return 'text-muted-foreground';
    }
    return 'text-primary';
  };

  const formatContent = (content: any): string => {
    try {
      if (typeof content === 'string') {
        if (!content.trim().startsWith('{') && !content.trim().startsWith('[')) {
          return content;
        }
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return content;
        }
      }
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  };

  const renderedHtmlResources = useMemo(() => {
    const resourceStyle = toolName == 'show_user_status'
      ? { minHeight: 695 }
      : { minHeight: 425 };
      
    return htmlResourceContents.map((resourceData, index) => (
      <UIResourceRenderer
        key={resourceData.uri || `html-resource-${index}`}
        resource={resourceData}
        htmlProps={{
          style: resourceStyle,
        }}
        onUIAction={handleUiAction}
      />
    ));
  }, [htmlResourceContents, toolName, handleUiAction]);

  return (
    <div
      className={cn(
        'flex flex-col mb-2 rounded-md border border-border/50 overflow-hidden',
        'bg-gradient-to-b from-background to-muted/30 backdrop-blur-sm',
        'transition-all duration-200 hover:border-border/80 group'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors',
          'hover:bg-muted/20'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-center rounded-full w-5 h-5 bg-primary/5 text-primary">
          <TerminalSquare className="h-3.5 w-3.5" />
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground flex-1">
          <span className="text-foreground font-semibold tracking-tight">{toolName}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
          <span className={cn('font-medium', getStatusClass())}>
            {state === 'call'
              ? isLatestMessage && status !== 'ready'
                ? 'Running'
                : 'Waiting'
              : 'Completed'}
          </span>
        </div>
        <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
          {getStatusIcon()}
          <div className="bg-muted/30 rounded-full p-0.5 border border-border/30">
            {isExpanded ? (
              <ChevronUpIcon className="h-3 w-3 text-foreground/70" />
            ) : (
              <ChevronDownIcon className="h-3 w-3 text-foreground/70" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-2 px-3 pb-3">
          {!!args && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 pt-1.5">
                <Code className="h-3 w-3" />
                <span className="font-medium">Arguments</span>
              </div>
              <pre
                className={cn(
                  'text-xs font-mono p-2.5 rounded-md overflow-x-auto',
                  'border border-border/40 bg-muted/10'
                )}
              >
                {formatContent(args)}
              </pre>
            </div>
          )}

          {!!result && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <ArrowRight className="h-3 w-3" />
                <span className="font-medium">Result</span>
              </div>

              {graphVisualizationDetected && (
                <div className="flex items-center gap-2 p-2.5 rounded-md border border-primary/20 bg-primary/5">
                  <ExternalLink className="h-4 w-4 text-primary" />
                  <span className="text-xs text-primary font-medium">
                    Graph visualization displayed in artifact panel
                  </span>
                </div>
              )}
              

              {htmlResourceContents.length > 0 ? (
                renderedHtmlResources
              ) : !graphVisualizationDetected ? (
                <pre
                  className={cn(
                    'text-xs font-mono p-2.5 rounded-md overflow-x-auto max-h-[300px] overflow-y-auto',
                    'border border-border/40 bg-muted/10'
                  )}
                >
                  {formatContent(result)}
                </pre>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
});