import { modelID } from "@/ai/providers";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2 } from "lucide-react";
import { ModelPicker } from "./model-picker";

interface InputProps {
  input: string;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  status: string;
  stop: () => void;
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
}

export const Textarea = ({
  input,
  handleInputChange,
  isLoading,
  status,
  stop,
  selectedModel,
  setSelectedModel,
}: InputProps) => {
  const isStreaming = status === "streaming" || status === "submitted";
  
  return (
    <div className="relative w-full group">
      <div className="absolute -inset-x-4 -inset-y-2 bottom-[-3rem] bg-gradient-to-r from-blue-500/20 via-purple-500/40 to-pink-500/20 dark:from-blue-500/10 dark:via-purple-500/15 dark:to-pink-500/10 ocean:from-blue-500/10 ocean:via-purple-500/15 ocean:to-pink-500/10 rounded-full blur-2xl opacity-50 scale-x-125 transition-all duration-300 group-focus-within:opacity-65 group-focus-within:scale-x-140 group-focus-within:from-blue-500/25 group-focus-within:via-purple-500/50 group-focus-within:to-pink-500/25 dark:group-focus-within:opacity-70 dark:group-focus-within:scale-x-145 dark:group-focus-within:from-blue-500/15 dark:group-focus-within:via-purple-500/25 dark:group-focus-within:to-pink-500/15"></div>
      <ShadcnTextarea
        className="relative resize-none bg-white/30 dark:bg-muted/30 ocean:bg-muted/20 backdrop-blur-md w-full rounded-2xl pr-12 pt-4 pb-16 min-h-10 placeholder:text-foreground/60 focus-visible:ring-ring/60 border border-gray-300/80 dark:border-white/40 ocean:border-white/40 dark:shadow-2xl dark:shadow-black/20 ocean:shadow-2xl ocean:shadow-black/20"
        value={input}
        autoFocus
        placeholder="Send a message..."
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !isLoading && input.trim()) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <ModelPicker
        setSelectedModel={setSelectedModel}
        selectedModel={selectedModel}
      />

      <button
        type={isStreaming ? "button" : "submit"}
        onClick={isStreaming ? stop : undefined}
        disabled={(!isStreaming && !input.trim()) || (isStreaming && status === "submitted")}
        className={`absolute right-2 bottom-2 rounded-full p-2 disabled:bg-muted disabled:cursor-not-allowed transition-all duration-200 ${
          (!isStreaming && input.trim()) 
            ? "bg-primary brightness-85 dark:bg-primary dark:brightness-140 ocean:bg-primary hover:bg-primary dark:hover:bg-primary hover:brightness-90 hover:dark:brightness-140 hover:scale-105 hover:shadow-lg hover:shadow-muted-foreground/30 dark:hover:shadow-primary/30 ocean:hover:shadow-primary/30" 
            : "bg-primary"
        }`}
      >
        {isStreaming ? (
          <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
        ) : (
          <ArrowUp className={`h-4 w-4 ${
            (!isStreaming && input.trim()) 
              ? "text-black dark:text-primary-foreground ocean:text-primary-foreground" 
              : "text-white dark:text-primary-foreground ocean:text-primary-foreground"
          }`} />
        )}
      </button>
    </div>
  );
};
