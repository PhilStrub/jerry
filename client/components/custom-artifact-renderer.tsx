'use client';

import { useEffect, useState, memo, useMemo, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUserId } from '@/lib/user-id';
import { useArtifact } from '@/lib/context/artifact-context';
import { useTheme } from 'next-themes';

interface CustomArtifactRendererProps {
  messageId: string;
  htmlProps?: {
    style?: React.CSSProperties;
  };
  onUIAction?: (result: any) => Promise<any>;
}

function CustomArtifactRendererComponent({ 
  messageId,
  htmlProps,
  onUIAction 
}: CustomArtifactRendererProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const { currentMessageId, currentHtmlContent } = useArtifact();
  const { theme } = useTheme();
  
  // Ref to store current blob URL and track content hash
  const blobUrlRef = useRef<string | null>(null);
  const contentHashRef = useRef<string | null>(null);

  // Function to inject theme-aware CSS into HTML content - memoized to prevent re-renders
  const injectThemeStyles = useCallback((htmlContent: string): string => {
    const themeStyles = `
      <style>
        :root {
          --background: ${theme === 'dark' ? 'oklch(0.20 0 0)' : 'oklch(1.00 0 0)'};
          --foreground: ${theme === 'dark' ? 'oklch(0.96 0 0)' : 'oklch(0.20 0 0)'};
          --muted: ${theme === 'dark' ? 'oklch(0.27 0 0)' : 'oklch(0.91 0.00 0)'};
          --border: ${theme === 'dark' ? 'oklch(0.32 0.01 250)' : 'oklch(0.88 0.00 0)'};
        }
        
        html, body {
          background-color: hsl(from var(--background) h s l) !important;
          color: hsl(from var(--foreground) h s l) !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        
        body {
          min-height: 100vh !important;
        }
      </style>
    `;

    // Check if it's a full HTML document
    const isFullDocument = htmlContent.trim().toLowerCase().startsWith('<!doctype html') || 
                           htmlContent.trim().toLowerCase().startsWith('<html');

    if (isFullDocument) {
      // Inject into head section
      const headMatch = htmlContent.match(/<head[^>]*>/i);
      if (headMatch) {
        const insertPosition = headMatch.index! + headMatch[0].length;
        return htmlContent.slice(0, insertPosition) + themeStyles + htmlContent.slice(insertPosition);
      } else {
        // If no head tag, add after html tag
        const htmlMatch = htmlContent.match(/<html[^>]*>/i);
        if (htmlMatch) {
          const insertPosition = htmlMatch.index! + htmlMatch[0].length;
          return htmlContent.slice(0, insertPosition) + `<head>${themeStyles}</head>` + htmlContent.slice(insertPosition);
        }
      }
    }

    // For fragments, wrap with themed container
    return `
      <html class="${theme || 'light'}">
        <head>
          ${themeStyles}
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `;
  }, [theme]);

  useEffect(() => {
    let isCancelled = false;

    const handleArtifactContent = async (): Promise<void> => {
      if (isCancelled || !messageId) {
        if (!messageId) {
          setError('No message ID provided');
          setLoading(false);
        }
        return;
      }

      // If this is the current artifact and we have HTML content directly, use it
      if (currentMessageId === messageId && currentHtmlContent) {
        console.log('[ARTIFACT RENDERER] Using current HTML content from context');
        setContent(currentHtmlContent);
        setLoading(false);
        setError(null);
        return;
      }

      // Otherwise, fetch from database for historical artifacts
      console.log('[ARTIFACT RENDERER] Fetching stored artifact for messageId:', messageId);
      setLoading(true);
      setError(null);
      setRetryCount(0);

      try {
        const userId = getUserId();
        const response = await fetch(`/api/artifact?messageId=${messageId}`, {
          headers: {
            'x-user-id': userId
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log('[ARTIFACT RENDERER] Error response:', response.status, errorText);
          
          if (response.status === 404) {
            setError('Artifact not found for this message');
          } else if (response.status === 403) {
            setError('Unauthorized access to artifact');
          } else {
            setError(`Failed to load artifact: ${response.status}`);
          }
          setLoading(false);
          return;
        }

        const result = await response.json();
        console.log('[ARTIFACT RENDERER] API response:', { 
          success: result.success, 
          hasContent: !!result.htmlContent,
          contentLength: result.htmlContent?.length || 0 
        });

        if (result.success && result.htmlContent) {
          console.log('[ARTIFACT RENDERER] Setting content from database');
          setContent(result.htmlContent);
          setLoading(false);
        } else {
          console.log('[ARTIFACT RENDERER] No HTML content in response');
          setError('No HTML content found for this message');
          setLoading(false);
        }
      } catch (err) {
        if (isCancelled) return;
        
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('[ARTIFACT RENDERER] Fetch error:', errorMessage);
        setError(`Failed to load artifact: ${errorMessage}`);
        setLoading(false);
      }
    };

    handleArtifactContent();

    // Cleanup function
    return () => {
      isCancelled = true;
    };
  }, [messageId, currentMessageId, currentHtmlContent]);

  // Memoize themed content and blob URL creation - must be called before early returns
  const blobUrl = useMemo(() => {
    if (!content) return null;
    
    // Create a simple hash of the content + theme for caching
    const contentHash = `${content}-${theme}`;
    
    // If content hasn't changed, reuse existing blob URL
    if (contentHashRef.current === contentHash && blobUrlRef.current) {
      return blobUrlRef.current;
    }
    
    // Clean up previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    
    // Create new themed content and blob URL
    const themedContent = injectThemeStyles(content);
    const blob = new Blob([themedContent], { type: 'text/html' });
    const newBlobUrl = URL.createObjectURL(blob);
    
    // Store references
    blobUrlRef.current = newBlobUrl;
    contentHashRef.current = contentHash;
    
    return newBlobUrl;
  }, [content, theme, injectThemeStyles]);
  
  // Cleanup function for blob URLs - must be called before early returns
  const cleanupBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
      contentHashRef.current = null;
    }
  }, []);
  
  // Cleanup blob URL on unmount - must be called before early returns
  useEffect(() => {
    return cleanupBlobUrl;
  }, [cleanupBlobUrl]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="animate-spin h-6 w-6" />
        <div className="text-center">
          <div className="font-semibold">Loading artifact...</div>
          <div className="text-sm text-gray-600 mt-2">Message ID: {messageId}</div>
        </div>
      </div>
    );
  }

  if (error) {
    const handleReload = () => {
      window.location.reload();
    };

    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-gray-700 dark:text-gray-300 mb-4">Error loading artifact</p>
        <Button onClick={handleReload} variant="secondary">Reload</Button>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="p-4 border border-gray-200 rounded bg-gray-50">
        <p className="text-gray-600">No content available for message: {messageId}</p>
      </div>
    );
  }

  // Return stable iframe without dynamic key to prevent remounting
  return (
    <iframe
      src={blobUrl || ''}
      style={{
        ...htmlProps?.style,
        border: 'none',
        width: '100%',
        height: '100%'
      }}
      sandbox="allow-scripts allow-same-origin"
      title="Artifact Visualization"
    />
  );
}

// Enhanced memoization to prevent re-renders when props haven't changed
export const CustomArtifactRenderer = memo(CustomArtifactRendererComponent, (prevProps, nextProps) => {
  return (
    prevProps.messageId === nextProps.messageId &&
    JSON.stringify(prevProps.htmlProps) === JSON.stringify(nextProps.htmlProps) &&
    prevProps.onUIAction === nextProps.onUIAction
  );
}); 