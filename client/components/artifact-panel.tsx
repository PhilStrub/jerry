'use client';

import { useCallback, memo, useEffect, useState } from 'react';
import { CustomArtifactRenderer } from './custom-artifact-renderer';
import { UIActionResult } from '@mcp-ui/client';
import { X, ChevronDown, Clock, RotateCcw } from 'lucide-react';
import { useArtifact } from '@/lib/context/artifact-context';
import { useParams } from 'next/navigation';
import { getUserId } from '@/lib/user-id';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface ArtifactPanelProps {
  onUIAction?: (result: UIActionResult) => Promise<any>;
}

interface ArtifactHistoryItem {
  messageId: string;
  description: string;
  createdAt: string;
}

function ArtifactPanelComponent({ 
  onUIAction 
}: ArtifactPanelProps) {
  const { currentMessageId, isArtifactVisible, hideArtifact, setCurrentMessageId } = useArtifact();
  const params = useParams();
  const chatId = params?.id as string | undefined;
  const [artifactHistory, setArtifactHistory] = useState<ArtifactHistoryItem[]>([]);
  const [userId, setUserId] = useState<string>('');

  // Get user ID on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserId(getUserId());
    }
  }, []);

  // Load artifact history when chat changes or when currentMessageId changes (indicating new artifacts)
  useEffect(() => {
    const loadArtifactHistory = async () => {
      if (!chatId || !userId) return;

      try {
        const response = await fetch(`/api/artifact/list?chatId=${chatId}`, {
          headers: {
            'x-user-id': userId
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.artifacts) {
            setArtifactHistory(result.artifacts);
          }
        }
      } catch (error) {
        console.error('Failed to load artifact history:', error);
      }
    };

    loadArtifactHistory();
  }, [chatId, userId, currentMessageId]); // Added currentMessageId to refresh when artifacts change
// =======
//   const { hideArtifact, setArtifactContent, refreshArtifact } = useArtifact();
// >>>>>>> origin/develop
  
  const handleClose = useCallback(() => {
    // Definitively close the artifact - both hide it and clear content
    hideArtifact();
    setCurrentMessageId(null);
  }, [hideArtifact, setCurrentMessageId]);
  
  const safeOnUIAction = useCallback(async (result: UIActionResult) => {
    try {
      if (onUIAction && typeof onUIAction === 'function') {
        return await onUIAction(result);
      } else {
        console.error('onUIAction is not a function:', typeof onUIAction, onUIAction);
        return Promise.resolve({ status: 'error', message: 'No UI action handler available' });
      }
    } catch (error) {
      console.error('Error in safeOnUIAction:', error);
      return Promise.resolve({ status: 'error', message: `Action handler error: ${error}` });
    }
  }, [onUIAction]);

  if (!isArtifactVisible || !currentMessageId) {
    return null;
  }

  return (
    <div className="flex flex-col h-full border-l border-border/50 bg-background">
      {/* Header */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-lg text-foreground/90">Artifact</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted/50 transition-colors"
              aria-label="Close artifact panel"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
{/* <<<<<<< HEAD
=======
          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshArtifact()}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted/50 transition-colors"
              aria-label="Refresh artifact"
              title="Refresh artifact"
            >
              <RotateCcw className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted/50 transition-colors"
              aria-label="Close artifact panel"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
>>>>>>> origin/develop */}
        </div>
      </div>

      {/* Content */}
      <div 
        id="artifact-panel"
        className="flex-1 overflow-hidden"
      >
        {currentMessageId && (
          <CustomArtifactRenderer
            messageId={currentMessageId}
            htmlProps={{
              style: {
                minHeight: 400,
                width: '100%',
                height: '100%',
              }
            }}
            onUIAction={safeOnUIAction}
          />
        )}
      </div>
    </div>
  );
}

// Enhanced memoization to prevent re-renders when props haven't changed
export const ArtifactPanel = memo(ArtifactPanelComponent, (prevProps, nextProps) => {
  return (
    prevProps.onUIAction === nextProps.onUIAction
  );
});

