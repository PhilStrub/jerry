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
    console.log(`[PROVIDERS] Found ${key} in process.env`);
    return process.env[key] || undefined;
  }

  // Fall back to localStorage if available
  if (typeof window !== 'undefined') {
    const localValue = window.localStorage.getItem(key);
    if (localValue) {
      console.log(`[PROVIDERS] Found ${key} in localStorage`);
      return localValue;
    }
  }

  console.warn(`[PROVIDERS] ${key} not found in process.env or localStorage`);
  return undefined;
};

// Create provider instances with API keys from localStorage
const openaiClient = createOpenAI({
  apiKey: getApiKey('OPENAI_API_KEY'),
});

const openrouterClient = createOpenAI({
  apiKey: getApiKey('OPENROUTER_API_KEY'),
  baseURL: 'https://openrouter.ai/api/v1',
});




const languageModels = {
  "gpt-5": openaiClient("gpt-5-2025-08-07"),
  "claude-3.5-sonnet": openrouterClient("anthropic/claude-3.5-sonnet"),
  "claude-3-opus": openrouterClient("anthropic/claude-3-opus"),
  "gpt-4-turbo": openrouterClient("openai/gpt-4-turbo"),
  "qwen-2.5-7b": openrouterClient("phala/qwen-2.5-7b-instruct"),
};



export const modelDetails: Record<keyof typeof languageModels, ModelInfo> = {
  "gpt-5": {
    provider: "OpenAI",
    name: "GPT-5",
    description: "Latest version of OpenAI's GPT-5 with strong reasoning and coding capabilities.",
    apiVersion: "gpt-5-2025-08-07",
    capabilities: ["Reasoning", "Code", "Agentic"]
  },
  "claude-3.5-sonnet": {
    provider: "OpenRouter",
    name: "Claude 3.5 Sonnet",
    description: "Anthropic's Claude 3.5 Sonnet via OpenRouter - excellent for reasoning and coding.",
    apiVersion: "anthropic/claude-3.5-sonnet",
    capabilities: ["Reasoning", "Code", "Agentic"]
  },
  "claude-3-opus": {
    provider: "OpenRouter",
    name: "Claude 3 Opus",
    description: "Anthropic's most capable model via OpenRouter.",
    apiVersion: "anthropic/claude-3-opus",
    capabilities: ["Reasoning", "Code", "Agentic"]
  },
  "gpt-4-turbo": {
    provider: "OpenRouter",
    name: "GPT-4 Turbo",
    description: "OpenAI's GPT-4 Turbo via OpenRouter.",
    apiVersion: "openai/gpt-4-turbo",
    capabilities: ["Reasoning", "Code", "Agentic"]
  },
  "qwen-2.5-7b": {
    provider: "OpenRouter (Phala)",
    name: "Qwen 2.5 7B Instruct",
    description: "Alibaba's Qwen 2.5 7B model via Phala on OpenRouter - efficient and multilingual.",
    apiVersion: "phala/qwen-2.5-7b-instruct",
    capabilities: ["Reasoning", "Code", "Multilingual"]
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
