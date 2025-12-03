# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development server with Turbopack
pnpm dev

# Production build with Turbopack  
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint

# Type checking
npx tsc --noEmit
```

## Getting Started

### Prerequisites
- Node.js 18+ and pnpm installed

### Setup Instructions

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment variables:**
   - Copy `env-example.txt` to `.env`
   - Add your AI provider API keys (Anthropic, OpenAI, Groq)

3. **Start development server:**
   ```bash
   pnpm dev
   ```

   The application will be accessible at **http://localhost:3000**

**Note:** This application runs in stateless mode with no database persistence. Chat history is maintained only in browser memory and will be lost on page refresh.

## Architecture Overview

This is a Next.js App Router application that provides an MCP (Model Context Protocol) chat interface with dynamic AI provider integration and server management.

### Core Architecture Components

**MCP Integration System**
- `lib/context/mcp-context.tsx` - Central MCP server management with React context
- `lib/mcp-client.ts` - MCP client initialization and tool aggregation 
- `app/actions.ts` - Server actions for sandbox lifecycle management
- `lib/mcp-sandbox.ts` - Sandboxing system for stdio-based MCP servers

The MCP system supports two server types:
- **SSE servers**: Direct HTTP connections to running MCP servers
- **stdio servers**: Command-line MCP servers wrapped in sandboxed environments

MCP servers are managed through a context provider that handles:
- Server connection lifecycle (connecting/connected/error states)
- Sandboxing for stdio servers using Daytona SDK with Supergateway for HTTP bridging
- Tool aggregation from multiple active servers
- Persistent server configurations in localStorage

**Stdio Server Sandboxing**: Command-line MCP servers are containerized using Daytona SDK in isolated environments with configurable resources (2 CPU, 4GB RAM, 5GB disk). Supergateway bridges stdio communication to HTTP endpoints, converting stdio servers to streamable-http format for consistent client integration.

**Chat System Architecture**
- `app/api/chat/route.ts` - Streaming chat API with MCP tool integration
- `components/chat.tsx` - Main chat interface with real-time messaging
- `lib/chat-store.ts` - Chat state management
- `lib/hooks/use-chats.ts` - React Query integration for chat history

The chat system streams responses using the AI SDK with tool calling support from connected MCP servers. Each chat request:
1. Initializes MCP clients from active servers
2. Aggregates tools from all connected servers
3. Streams AI responses with tool execution
4. Messages are ephemeral and not persisted (stateless mode)

**AI Provider Management**
- `ai/providers.ts` - Multi-provider AI model configuration
- API keys managed through environment variables + localStorage fallback
- Currently supports Anthropic Claude, Groq, and extensible to OpenAI/XAI
- Reasoning extraction middleware for models that support thinking

### Key Data Flow

1. **MCP Server Registration**: Servers configured in MCP context, persisted to localStorage
2. **Server Activation**: stdio servers sandboxed via Daytona, SSE servers connected directly
3. **Chat Initialization**: Active servers provide tools to chat API endpoint
4. **Message Processing**: AI SDK streams responses with tool calling to MCP tools
5. **Client State**: Messages maintained in browser memory only (no server-side persistence)

### Development Notes

- Uses Turbopack for fast development builds
- Real-time UI updates via React Query and AI SDK streaming
- MCP server lifecycle tied to React component lifecycle with cleanup
- Local storage used for user preferences, API keys, and server configurations
- ESLint configured with Next.js rules, unused variables and explicit any warnings disabled
- Stateless architecture - no database or server-side persistence
- Railpack deployment configuration for Node.js 22 and Python 3.12.7 environments

### Environment Setup

Required environment variables:
- `ANTHROPIC_API_KEY` - Anthropic API key (or via localStorage)
- `GROQ_API_KEY` - Groq API key (or via localStorage)
- `OPENAI_API_KEY` - OpenAI API key (or via localStorage)

See `env-example.txt` for a complete configuration template.

**Dual API Key Management**: The application supports both environment variables and localStorage for API keys. Environment variables take precedence, with localStorage serving as a fallback for runtime configuration. This allows users to configure API keys through the UI without server restarts.

### Testing

Currently no test framework is configured. Tests should be added as the project matures.