'use client';

import { useMemo } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ArtifactPanel } from "@/components/artifact-panel";
import { useArtifact } from "@/lib/context/artifact-context";
import { ArtifactHistoryButton } from '@/components/artifact-history-button';


export function MainLayout({ children }: { children: React.ReactNode }) {
  const { 
    currentMessageId,
    isArtifactVisible, 
    artifactPanelSize, 
    setArtifactPanelSize,
    getOnArtifactAction
  } = useArtifact();

  // Memoize the onUIAction to prevent unnecessary re-renders
  const onUIAction = useMemo(() => getOnArtifactAction(), [getOnArtifactAction]);

  return (
    <main className="flex-1 flex flex-col relative">
      <ArtifactHistoryButton />
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel 
          defaultSize={isArtifactVisible && currentMessageId ? 100 - artifactPanelSize : 100} 
          minSize={20}
        >
          <div className="flex-1 flex justify-center h-full relative">
            {children}
          </div>
        </ResizablePanel>
        
        {(isArtifactVisible && currentMessageId) && (
          <>
            <ResizableHandle />
            <ResizablePanel 
              defaultSize={artifactPanelSize} 
              minSize={20} 
              maxSize={85}
              onResize={(size) => setArtifactPanelSize(size)}
            >
              <ArtifactPanel
                onUIAction={onUIAction}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </main>
  );
}