import { useEffect, useState, memo, useCallback } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { useParams } from 'next/navigation';
import { getUserId } from '@/lib/user-id';
import { useArtifact } from '@/lib/context/artifact-context';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface ArtifactHistoryItem {
  messageId: string;
  description: string;
  createdAt: string;
}

function ArtifactHistoryButtonComponent() {
  const { currentMessageId, setCurrentMessageId } = useArtifact();
  const params = useParams();
  const chatId = params?.id as string | undefined;
  const [artifactHistory, setArtifactHistory] = useState<ArtifactHistoryItem[]>([]);
  const [userId, setUserId] = useState('');

  // obtain user id
  useEffect(() => {
    if (typeof window !== 'undefined') setUserId(getUserId());
  }, []);

  const loadHistory = useCallback(async () => {
    if (!chatId || !userId) {
      setArtifactHistory([]); // Clear history if no chatId
      return;
    }
    try {
      const resp = await fetch(`/api/artifact/list?chatId=${chatId}`, {
        headers: { 'x-user-id': userId },
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.success && result.artifacts) {
            const sorted = [...result.artifacts].sort((a:any,b:any)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            setArtifactHistory(sorted);
        }
      }
    } catch (err) {
      console.error('[ArtifactHistoryButton] failed to load history', err);
    }
  }, [chatId, userId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, currentMessageId]);

  if (artifactHistory.length <= 1) return null;

  return (
    <div className="fixed top-2 right-16 z-40">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-3 shadow">
            <Clock className="h-4 w-4 mr-1" />
            History
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {artifactHistory.map((artifact: ArtifactHistoryItem) => (
            <DropdownMenuItem
              key={artifact.messageId}
              onClick={() => setCurrentMessageId(artifact.messageId)}
              className={`cursor-pointer ${currentMessageId === artifact.messageId ? 'bg-muted' : ''}`}
            >
              <div className="flex flex-col w-full">
                <div className="text-sm font-medium truncate">{artifact.description}</div>
                <div className="text-xs text-muted-foreground">{new Date(artifact.createdAt).toLocaleString()}</div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const ArtifactHistoryButton = memo(ArtifactHistoryButtonComponent);