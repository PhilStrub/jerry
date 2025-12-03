'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { UIActionResult } from '@mcp-ui/client';

interface ArtifactContextType {
  currentMessageId: string | null;
  currentHtmlContent: string | null;
  isArtifactVisible: boolean;
  artifactPanelSize: number;
  getOnArtifactAction: () => ((result: UIActionResult) => Promise<any>) | undefined;
  setCurrentMessageId: (messageId: string | null) => void;
  setCurrentArtifact: (messageId: string | null, htmlContent?: string | null) => void;
// =======
//   setArtifactContent: (content: HtmlResourceData | null) => void;
//   refreshArtifact: () => void;
// >>>>>>> origin/develop
  setOnArtifactAction: (handler: ((result: UIActionResult) => Promise<any>) | undefined) => void;
  showArtifact: () => void;
  hideArtifact: () => void;
  setArtifactPanelSize: (size: number) => void;
}

const ArtifactContext = createContext<ArtifactContextType | undefined>(undefined);

export function ArtifactProvider({ children }: { children: React.ReactNode }) {
  const [currentMessageId, setCurrentMessageIdState] = useState<string | null>(null);
  const [currentHtmlContent, setCurrentHtmlContentState] = useState<string | null>(null);
  const [isArtifactVisible, setIsArtifactVisible] = useState(false);
  const [artifactPanelSize, setArtifactPanelSize] = useState(75); // Default 75% width
  const onArtifactActionRef = useRef<((result: UIActionResult) => Promise<any>) | undefined>(undefined);
  const params = useParams();
  const currentChatId = params?.id;

  // Track the chat ID to clear state when navigating between chats
  const [lastChatId, setLastChatId] = useState<string | null>(null);

  // Clear artifact state when navigating to a different chat
  React.useEffect(() => {
    const chatId = currentChatId as string || null;
    if (chatId !== lastChatId) {
      setCurrentMessageIdState(null);
      setCurrentHtmlContentState(null);
      setIsArtifactVisible(false);
      onArtifactActionRef.current = undefined;
      setLastChatId(chatId);
    }
  }, [currentChatId, lastChatId]);

  const setCurrentMessageId = useCallback((messageId: string | null) => {
    setCurrentMessageIdState(messageId);
    setCurrentHtmlContentState(null); // Clear HTML content when setting message ID only
    
    // Show the panel when a message ID is set
    if (messageId) {
      setIsArtifactVisible(true);
    }
  }, []);

  const setCurrentArtifact = useCallback((messageId: string | null, htmlContent?: string | null) => {
    setCurrentMessageIdState(messageId);
    setCurrentHtmlContentState(htmlContent || null);
    
    // Show the panel when a message ID is set
    if (messageId) {
      setIsArtifactVisible(true);
    }
  }, []);


// =======
//   // Force-refresh the current artifact by bumping the client-side refresh timestamp
//   const refreshArtifact = useCallback(() => {
//     setArtifactContentState(prev => {
//       if (!prev) return prev;
//       return { ...prev, _refreshTimestamp: Date.now() };
//     });
//     setIsArtifactVisible(true);
//   }, []);

// >>>>>>> origin/develop
  const showArtifact = useCallback(() => {
    setIsArtifactVisible(true);
  }, []);

  const hideArtifact = useCallback(() => {
    setIsArtifactVisible(false);
  }, []);

  const setOnArtifactAction = useCallback((handler: ((result: UIActionResult) => Promise<any>) | undefined) => {
    onArtifactActionRef.current = handler;
  }, []);

  // Create a stable getter function for onArtifactAction to avoid memoization issues
  const getOnArtifactAction = useCallback(() => {
    return onArtifactActionRef.current;
  }, []);

  const value: ArtifactContextType = useMemo(() => ({
    currentMessageId,
    currentHtmlContent,
    isArtifactVisible,
    artifactPanelSize,
    getOnArtifactAction,
    setCurrentMessageId,
    setCurrentArtifact,
// =======
//     setArtifactContent,
//     refreshArtifact,
// >>>>>>> origin/develop
    setOnArtifactAction,
    showArtifact,
    hideArtifact,
    setArtifactPanelSize,
  }), [
    currentMessageId,
    currentHtmlContent,
    isArtifactVisible,
    artifactPanelSize,
    getOnArtifactAction,
    setCurrentMessageId,
    setCurrentArtifact,
// =======
//     setArtifactContent,
//     refreshArtifact,
//     setOnArtifactAction,
// >>>>>>> origin/develop
    showArtifact,
    hideArtifact,
    setArtifactPanelSize,
  ]);

  return (
    <ArtifactContext.Provider value={value}>
      {children}
    </ArtifactContext.Provider>
  );
}

export function useArtifact() {
  const context = useContext(ArtifactContext);
  if (context === undefined) {
    throw new Error('useArtifact must be used within an ArtifactProvider');
  }
  return context;
}