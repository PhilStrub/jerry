"use client";

import { motion } from "motion/react";
import { Button } from "./ui/button";
import { memo } from "react";
import { widgetPrompts, type WidgetPrompt } from "@/lib/widget-prompts";
import { Message } from "@ai-sdk/react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/user-id";

interface ConversationWidgetsProps {
  append: (message: Message) => void;
  chatId?: string;
  generatedChatId?: string;
  onWidgetClick?: (chatTitle?: string, hiddenContext?: string) => void;
}

function PureConversationWidgets({ append, chatId, generatedChatId, onWidgetClick }: ConversationWidgetsProps) {
  const router = useRouter();
  
  const handleWidgetClick = async (widget: WidgetPrompt) => {
    // Notify parent about widget click with chat title and hidden context
    if (onWidgetClick) {
      onWidgetClick(widget.chatTitle);
    }
    
    // For new chats, pre-create the chat with the widget title
    if (!chatId && generatedChatId) {
      try {
        const response = await fetch('/api/chats', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': getUserId(),
          },
          body: JSON.stringify({
            id: generatedChatId,
            title: widget.chatTitle,
          }),
        });
        
        if (!response.ok) {
          console.warn('Failed to pre-create chat with widget title');
        }
      } catch (error) {
        console.warn('Error pre-creating chat:', error);
      }
    }
    
    // Append only the visible assistant message
    const userMessage: Message = {
      id: nanoid(),
      role: "user",
      content: widget.message,
    };
    
    append(userMessage);
    
    // Handle navigation for new chats
    if (!chatId && generatedChatId) {
      // If this is a new conversation, redirect to the chat page with the generated ID
      setTimeout(() => {
        router.push(`/chat/${generatedChatId}`);
      }, 100); // Small delay to ensure the message is processed
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto mt-8">
      {widgetPrompts.map((widget, index) => (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 * index }}
          key={widget.id}
        >
          <Button
            variant="outline"
            onClick={() => handleWidgetClick(widget)}
            className="text-left bg-white/30 dark:bg-muted/30 ocean:bg-muted/20 backdrop-blur-md rounded-xl px-3 py-3 text-sm flex-col w-full h-20 justify-start items-start gap-2 hover:bg-white/50 hover:shadow-lg hover:shadow-white/20 dark:hover:bg-white/15 dark:hover:shadow-lg dark:hover:shadow-blue-500/20 ocean:hover:bg-muted/60 border border-gray-300/80 dark:border-white/40 ocean:border-white/40 dark:shadow-xl dark:shadow-black/15 ocean:shadow-xl ocean:shadow-black/15 transition-all duration-200"
          >
            <span className="font-medium text-base leading-tight truncate w-full">{widget.title}</span>
            <span className="text-[10px] leading-tight truncate w-full text-foreground/50 dark:text-foreground/70">
              {widget.subtitle}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const ConversationWidgets = memo(PureConversationWidgets);