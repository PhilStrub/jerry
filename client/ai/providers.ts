import { createOpenAI } from "@ai-sdk/openai";

import { 
  customProvider, 
  wrapLanguageModel, 
  extractReasoningMiddleware 
} from "ai";

export interface ModelInfo {
  provider: string;
  name: string;
  description: string;
  apiVersion: string;
  capabilities: string[];
}

const anthropicMiddleware = extractReasoningMiddleware({
  tagName: 'think',
});

// Helper to get API keys from environment variables first, then localStorage
const getApiKey = (key: string): string | undefined => {
  // Check for environment variables first
  if (process.env[key]) {
    return process.env[key] || undefined;
  }
  
  // Fall back to localStorage if available
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem(key) || undefined;
  }
  
  return undefined;
};

// Create provider instances with API keys from localStorage
const openaiClient = createOpenAI({
  apiKey: getApiKey('OPENAI_API_KEY'),
});



const languageModels = {
  "gpt-5": openaiClient("gpt-5-2025-08-07"),
};

export const modelDetails: Record<keyof typeof languageModels, ModelInfo> = {
  "gpt-5": {
    provider: "OpenAI",
    name: "GPT-5",
    description: "Latest version of OpenAI's GPT-5 with strong reasoning and coding capabilities.",
    apiVersion: "gpt-5-2025-08-07",
    capabilities: ["Reasoning", "Code", "Agentic"]
  },
  "gpt-oss-120b": {
    provider: "Groq",
    name: "GPT-OSS 120B",
    description: "Groq's GPT-OSS 120B with strong reasoning and coding capabilities.",
    apiVersion: "openai/gpt-oss-120b",
    capabilities: ["Reasoning", "Code", "Agentic"]
  }
};

// Update API keys when localStorage changes (for runtime updates)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    // Reload the page if any API key changed to refresh the providers
    if (event.key?.includes('API_KEY')) {
      window.location.reload();
    }
  });
}

export const model = customProvider({
  languageModels,
});

export type modelID = keyof typeof languageModels;

export const MODELS = Object.keys(languageModels);

export const defaultModel: modelID = "gpt-5";
