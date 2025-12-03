# MCP Resource/Artifact System Documentation

## 1. Tool Call Processing & Rendering

**Data Stream Flow:**
- Messages arrive via Vercel AI SDK's `useChat` hook (components/chat.tsx:177-204) with structured `parts` array
- Each part has a type: `text`, `tool-invocation`, or `reasoning`
- Tool invocations contain: `toolName`, `state` (call/result), `args`, and `result`

**UI Rendering:**
- **components/message.tsx:162-198**: Parts are mapped and rendered based on type
- Tool invocations rendered via `<ToolInvocation>` component 
- Component tracks state: "call" (waiting/running) vs "result" (completed)
- Live message detection: `isLatestMessage && status !== "ready" && message.role === "assistant"`

## 2. Artifact Display Following Resource Fetch

**Resource Detection:**
- **components/tool-invocation.tsx:156-354**: `useEffect` monitors tool results for UI resources
- Checks for resources with `uri` starting with "ui://"
- Detection patterns:
  - Direct resource objects: `result.type === 'resource' && result.uri`
  - Nested content arrays: `result.content[].resource.uri`
  - Stringified JSON: Parses `result` string or `content[].text` for embedded resources
- Special case: "ui://graph-visualization" routes to artifact panel via `setCurrentArtifact()`

**HTML Content Fetching:**
- **components/tool-invocation.tsx:116-153**: `fetchHtmlContent()` retrieves resource data
- Makes POST to `/api/artifact/fetch` with URI and MCP servers
- **app/api/artifact/fetch/route.ts**: Connects to streamable-http MCP servers
- Uses MCP protocol's `client.readResource({ uri })` 
- Returns text content or decoded base64 blob

**Artifact Panel Display:**
- **components/artifact-panel.tsx**: Side panel controlled by `isArtifactVisible`
- **components/custom-artifact-renderer.tsx**: 
  - Checks context for live artifacts: `currentMessageId === messageId && currentHtmlContent`
  - Otherwise fetches from `/api/artifact?messageId=X` for historical artifacts
  - Renders via iframe for full HTML documents (detected by doctype/html tags)
  - Uses `dangerouslySetInnerHTML` for HTML fragments

## 3. Chat & Artifact Storage from Streaming

**Stream Processing:**
- **app/api/chat/route.ts:756-874**: `onFinish` callback after stream completes
- Calls `appendResponseMessages()` to merge streamed messages with existing
- Deduplicates using content-based keys: `${role}:${content.substring(0, 100)}`

**Per-Message HTML Extraction:**
- **app/api/chat/route.ts:173-269**: `extractHtmlResourcesForMessage()` 
- Scans `tool-invocation` parts for UI resources via `hasUIResourcesInResult()`
- Collects unique resource URIs from:
  - Direct resource results
  - Content arrays with resources  
  - Stringified JSON containing resources
- Fetches HTML via `fetchResourceContent()` from MCP servers

**Database Storage:**
- **app/api/chat/route.ts:271-352**: `convertToDBMessagesWithHTMLExtraction()`
- Creates DB message with `htmlResources` field if UI resources detected
- **lib/db/operations.ts:134-184**: `saveMessages()` inserts to PostgreSQL
- Schema (lib/db/schema.ts): `messages.htmlResources` text column stores HTML

## 4. Loading Past Chats & Artifacts

**Chat Loading:**
- **components/chat.tsx:66-101**: React Query fetches via `useQuery()`
- GET `/api/chats/[id]` returns chat with messages
- **components/chat.tsx:112-138**: `convertToUIMessages()` transforms DB format
- Preserves `parts` array with tool invocations and results

**Artifact Loading:**
- **components/custom-artifact-renderer.tsx:28-101**:
  - Priority 1: Check artifact context for current live artifact
  - Priority 2: Fetch from database via `/api/artifact?messageId=X`
- **app/api/artifact/route.ts GET**: 
  - Calls `getMessageWithHtmlResources(messageId)`
  - Verifies user owns chat via `chats.userId` check
  - Returns stored `htmlResources` content

**Auto-load Latest Artifact:**
- **components/chat.tsx:141-164**: On chat load, fetches `/api/artifact/latest?chatId=X`
- Sets `currentMessageId` in artifact context to display most recent

## 5. Artifact History System

**History Loading:**
- **components/artifact-panel.tsx:44-68**: `useEffect` loads history when chat/messageId changes
- GET `/api/artifact/list?chatId=X` returns all artifacts

**History API:**
- **app/api/artifact/list/route.ts**:
  - Calls `getMessagesWithHtmlResources(chatId, userId)`
  - **lib/db/operations.ts:186-201**: Queries messages WHERE `htmlResources IS NOT NULL`
  - Returns array with `messageId`, `createdAt`, and extracted description

**History UI:**
- Dropdown menu with artifact list
- Click to switch via `setCurrentMessageId()`

## Workflow Diagrams

### Complete Message-to-Artifact Workflow

```mermaid
sequenceDiagram
    participant User
    participant UI as components/chat.tsx
    participant SDK as Vercel AI SDK
    participant API as app/api/chat/route.ts
    participant MCP as MCP Servers
    participant DB as lib/db/operations.ts
    participant TI as components/tool-invocation.tsx
    participant AP as components/artifact-panel.tsx

    User->>UI: Types message & submits
    UI->>SDK: handleSubmit():177-204
    SDK->>API: POST /api/chat with messages[]
    
    Note over API: initializeMCPClients():549
    API->>API: streamText():584 with tools
    
    loop Streaming Response
        API-->>SDK: Chunk with tool calls
        SDK-->>UI: Update messages with parts[]
        UI->>TI: Render <ToolInvocation>:59-507
        
        Note over TI: state:"call":357-363
        API->>MCP: Execute tool via MCP protocol
        MCP-->>API: Tool results with UI resources
        API-->>SDK: Tool result chunks
        SDK-->>TI: Update parts with results
        Note over TI: state:"result":363
        
        alt UI Resource Detected
            TI->>TI: useEffect():157-354 detects ui://
            TI->>TI: fetchHtmlContent():116-153
            TI->>API: POST /api/artifact/fetch:133
            API->>MCP: client.readResource({uri}):37
            MCP-->>API: HTML content:42-46
            API-->>TI: HTML content response
            TI->>AP: setCurrentArtifact():208,288,298
            AP->>AP: CustomArtifactRenderer:142-152
        end
    end
    
    Note over API: onFinish():756-874
    API->>API: appendResponseMessages():759
    API->>API: extractHtmlResourcesForMessage():173-269
    API->>MCP: fetchResourceContent():121-170
    MCP-->>API: Consolidated HTML
    API->>DB: saveMessages():134-184
    DB->>DB: INSERT with htmlResources:166-174
    API-->>SDK: Stream completion
    SDK->>UI: Update final state
```

### Database Loading & Artifact Retrieval

```mermaid
sequenceDiagram
    participant User
    participant UI as components/chat.tsx
    participant MSG as components/messages.tsx
    participant M as components/message.tsx
    participant RQ as React Query
    participant CAPI as app/api/chats/[id]/route.ts
    participant AAPI as app/api/artifact/route.ts
    participant DB as lib/db/operations.ts
    participant AP as components/artifact-panel.tsx
    participant CR as components/custom-artifact-renderer.tsx
    participant CS as lib/chat-store.ts

    User->>UI: Navigate to /chat/[id]
    UI->>RQ: useQuery():66-101
    RQ->>CAPI: GET /api/chats/[id]
    CAPI->>DB: getChatById():87-106
    DB-->>CAPI: Chat with messages[]
    CAPI-->>RQ: Chat data with parts & htmlResources
    RQ->>CS: convertToUIMessages():190-258
    CS->>UI: UIMessages with parts preserved
    UI->>MSG: <Messages>:5-38
    MSG->>M: <Message>:121-250 per message
    
    Note over UI: Auto-load latest:141-164
    UI->>AAPI: GET /api/artifact/latest?chatId=X
    AAPI->>DB: getLatestMessageWithHtml():203-220
    DB-->>AAPI: Latest message with htmlResources
    AAPI-->>UI: { messageId, exists }
    UI->>AP: setCurrentMessageId():155
    
    AP->>CR: CustomArtifactRenderer:16-189
    alt Live Artifact (context):40-46
        CR->>CR: Use currentHtmlContent
    else Historical Artifact:49-101
        CR->>AAPI: GET /api/artifact?messageId=X:56
        AAPI->>DB: getMessageWithHtmlResources():222-226
        AAPI->>DB: Verify chat.userId:42-44
        DB-->>AAPI: Message with htmlResources
        AAPI-->>CR: HTML content:67-71
    end
    
    CR->>CR: Create blob URL:143-144
    alt Full HTML Document:147-148
        CR->>CR: Render iframe:153-172
    else HTML Fragment
        CR->>CR: dangerouslySetInnerHTML:176-182
    end
    
    Note over AP: Load history:44-68
    AP->>AAPI: GET /api/artifact/list?chatId=X:50
    AAPI->>DB: getMessagesWithHtmlResources():186-201
    DB-->>AAPI: Messages WHERE htmlResources NOT NULL
    AAPI-->>AP: artifacts[]:36-48
    AP->>AP: setArtifactHistory():59
```

## Critical Implementation Details

- HTML resources stored per-message, not globally - enables precise artifact tracking
- Resource URIs deduplicated during extraction to avoid redundant fetches
- Content-based message deduplication prevents duplicate DB entries
- MCP servers converted to streamable-http format for consistent access
- Artifact panel tied to specific messageId for accurate display
- Supports multiple resources per message (concatenated with separators)
- User authorization validated at every artifact access point

