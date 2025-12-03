"use client";
import { MODELS, modelDetails, type modelID, defaultModel } from "@/ai/providers";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "@/lib/utils";
import { Sparkles, Zap, Info, Bolt, Code, Brain, Lightbulb, Image, Gauge, Rocket, Bot, Gem } from "lucide-react";
import { useState, useEffect } from "react";
import NextImage from "next/image";
import { useArtifact } from "@/lib/context/artifact-context";

interface ModelPickerProps {
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
}

export const ModelPicker = ({ selectedModel, setSelectedModel }: ModelPickerProps) => {
  const [hoveredModel, setHoveredModel] = useState<modelID | null>(null);
  const { isArtifactVisible } = useArtifact();
  
  // Ensure we always have a valid model ID
  const validModelId = MODELS.includes(selectedModel) ? selectedModel : defaultModel;
  
  // If the selected model is invalid, update it to the default
  useEffect(() => {
    if (selectedModel !== validModelId) {
      setSelectedModel(validModelId as modelID);
    }
  }, [selectedModel, validModelId, setSelectedModel]);
  
  // Function to get the appropriate logo for each provider
  const getProviderIcon = (provider: string, modelId?: string) => {
    // Special case for Moonshot model - show Kimi logo
    if (modelId === 'moonshot-kimi-k2') {
      return (
        <NextImage
          src="/kimi-logo.png"
          alt="Kimi"
          width={12}
          height={12}
          className="rounded-sm"
        />
      );
    }
    
    switch (provider.toLowerCase()) {
      case 'anthropic':
        return (
          <NextImage
            src="/claude-logo.png"
            alt="Claude"
            width={12}
            height={12}
            className="rounded-sm"
          />
        );
      case 'openai':
        return (
          <NextImage
            src="/openai-logo.png"
            alt="OpenAI"
            width={12}
            height={12}
            className="rounded-sm filter brightness-0 dark:invert"
          />
        );
      case 'google':
      case 'google generative ai':
        return (
          <NextImage
            src="/gemini-logo.png"
            alt="Gemini"
            width={12}
            height={12}
            className="rounded-sm"
          />
        );
      case 'groq':
        return (
          <NextImage
            src="/openai-logo.png"
            alt="Groq"
            width={12}
            height={12}
            className="rounded-sm filter brightness-0 dark:invert"
          />
        );
      case 'xai':
        return <Sparkles className="h-3 w-3 text-yellow-500" />;
      default:
        return <Info className="h-3 w-3 text-blue-500" />;
    }
  };
  
  // Function to get capability icon
  const getCapabilityIcon = (capability: string) => {
    switch (capability.toLowerCase()) {
      case 'code':
        return <Code className="h-2.5 w-2.5" />;
      case 'reasoning':
        return <Brain className="h-2.5 w-2.5" />;
      case 'thinking':
        return <Brain className="h-2.5 w-2.5" />;
      case 'explicit-reasoning':
        return <Brain className="h-2.5 w-2.5" />;
      case 'advanced-reasoning':
        return <Brain className="h-2.5 w-2.5" />;
      case 'research':
        return <Lightbulb className="h-2.5 w-2.5" />;
      case 'vision':
        return <Image className="h-2.5 w-2.5" />;
      case 'fast':
      case 'rapid':
        return <Bolt className="h-2.5 w-2.5" />;
      case 'efficient':
      case 'compact':
        return <Gauge className="h-2.5 w-2.5" />;
      case 'creative':
      case 'balance':
        return <Rocket className="h-2.5 w-2.5" />;
      case 'agentic':
        return <Bot className="h-2.5 w-2.5" />;
      default:
        return <Info className="h-2.5 w-2.5" />;
    }
  };
  
  // Get capability badge color - all tags use grey
  const getCapabilityColor = (capability: string) => {
    return "bg-gray-100/60 text-gray-800 dark:bg-gray-800/40 ocean:bg-gray-800/40 dark:text-gray-300";
  };
  
  // Get current model details to display
  const displayModelId = hoveredModel || validModelId;
  const currentModelDetails = modelDetails[displayModelId];

  // Handle model change
  const handleModelChange = (modelId: string) => {
    if (MODELS.includes(modelId)) {
      const typedModelId = modelId as modelID;
      setSelectedModel(typedModelId);
    }
  };

  return (
    <div className="absolute bottom-2 left-2 z-10">
      <Select 
        value={validModelId} 
        onValueChange={handleModelChange} 
        defaultValue={validModelId}
      >
        <SelectTrigger 
          className={cn(
            "px-3 sm:px-4 h-8 sm:h-9 rounded-full group border-transparent bg-muted/70 dark:bg-muted/40 ocean:bg-muted/40 hover:bg-muted/80 dark:hover:bg-muted/50 ocean:hover:bg-muted/50 transition-all duration-200 ring-offset-background focus:ring-2 focus:ring-primary/25 focus:ring-offset-2 shadow-xs",
            // Dynamic widths based only on artifact panel state
            isArtifactVisible
              ? "!w-[120px] sm:!w-[140px] md:!w-[160px]" // Compact when artifact is visible
              : "!w-[200px] sm:!w-[240px] md:!w-[280px]"  // Full width when no artifact
          )}
        >
          <SelectValue 
            placeholder="Select model" 
            className="text-xs font-medium flex items-center gap-1 sm:gap-2 text-foreground/90"
          >
            <div className="flex items-center gap-1 sm:gap-2">
              {getProviderIcon(modelDetails[validModelId].provider, validModelId)}
              <span className="font-medium flex-1 text-left">{modelDetails[validModelId].name}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="center"
          className="bg-background/20 dark:bg-muted/20 ocean:bg-muted/20 backdrop-blur-lg border-border/40 rounded-lg overflow-hidden p-0 w-[320px] sm:w-[400px] md:w-[600px] shadow-lg"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] md:grid-cols-[240px_1fr] items-start">
            {/* Model selector column */}
            <div className="sm:border-r border-border/30 bg-muted/10 p-0 pr-1">
              <SelectGroup className="space-y-1">
                {MODELS.map((id) => {
                  const modelId = id as modelID;
                  return (
                    <SelectItem 
                      key={id} 
                      value={id}
                      onMouseEnter={() => setHoveredModel(modelId)}
                      onMouseLeave={() => setHoveredModel(null)}
                      className={cn(
                        "!px-2 sm:!px-3 py-1.5 sm:py-2 cursor-pointer rounded-md text-xs transition-colors duration-150",
                        "hover:bg-primary/20",
                        "focus:bg-primary/30 focus:outline-none",
                        "data-[highlighted]:bg-primary/30",
                        validModelId === id && "!bg-primary/40 font-medium"
                      )}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {getProviderIcon(modelDetails[modelId].provider, modelId)}
                          <span className="font-medium truncate">{modelDetails[modelId].name}</span>
                        </div>
                        <span className="text-[10px] sm:text-xs text-muted-foreground">
                          {modelDetails[modelId].provider}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </div>
            
            {/* Model details column - hidden on smallest screens, visible on sm+ */}
            <div className="sm:block hidden p-2 sm:p-3 md:p-4 flex-col">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {getProviderIcon(currentModelDetails.provider, displayModelId)}
                  <h3 className="text-sm font-semibold">{currentModelDetails.name}</h3>
                </div>
                <div className="text-xs text-muted-foreground mb-1">
                  Provider: <span className="font-medium">{currentModelDetails.provider}</span>
                </div>
                
                {/* Capability badges */}
                <div className="flex flex-wrap gap-1 mt-2 mb-3">
                  {currentModelDetails.capabilities.map((capability) => (
                    <span 
                      key={capability}
                      className={cn(
                        "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                        getCapabilityColor(capability)
                      )}
                    >
                      {getCapabilityIcon(capability)}
                      <span>{capability}</span>
                    </span>
                  ))}
                </div>
                
                <div className="text-xs text-foreground/90 leading-relaxed mb-3 hidden md:block">
                  {currentModelDetails.description}
                </div>
              </div>
              
              <div className="bg-muted/40 rounded-md p-2 hidden md:block">
                <div className="text-[10px] text-muted-foreground flex justify-between items-center">
                  <span>API Version:</span>
                  <code className="bg-background/80 px-2 py-0.5 rounded text-[10px] font-mono">
                    {currentModelDetails.apiVersion}
                  </code>
                </div>
              </div>
            </div>
            
            {/* Condensed model details for mobile only */}
            <div className="p-3 sm:hidden border-t border-border/30">
              <div className="flex flex-wrap gap-1 mb-2">
                {currentModelDetails.capabilities.slice(0, 4).map((capability) => (
                  <span 
                    key={capability}
                    className={cn(
                      "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                      getCapabilityColor(capability)
                    )}
                  >
                    {getCapabilityIcon(capability)}
                    <span>{capability}</span>
                  </span>
                ))}
                {currentModelDetails.capabilities.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">+{currentModelDetails.capabilities.length - 4} more</span>
                )}
              </div>
            </div>
          </div>
        </SelectContent>
      </Select>
    </div>
  );
};