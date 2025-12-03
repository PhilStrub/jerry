import { model, modelDetails, defaultModel, type modelID } from '@/ai/providers';
import { smoothStream, streamText, type UIMessage } from 'ai';
import { appendResponseMessages } from 'ai';
import { nanoid } from 'nanoid';
import { initializeMCPClients, type MCPServerConfig } from '@/lib/mcp-client';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const runtime = 'nodejs';

// Allow streaming responses up to 60 seconds
export const maxDuration = 160;

export const dynamic = 'force-dynamic';

// Helper function to extract and fetch HTML resources from messages
async function extractHtmlResources(messages: any[], mcpServers: MCPServerConfig[]): Promise<string | null> {
  const resourceUris: string[] = [];
  
  console.log('[HTML RESOURCES] Starting extraction from', messages.length, 'messages');
  
  // Scan all messages for resource URIs
  for (const message of messages) {
    if (message.parts) {
      for (const part of message.parts) {
        // Check tool invocation results for resources
        if (part.type === 'tool-invocation' && part.toolInvocation?.result) {
          const result = part.toolInvocation.result;
          console.log('[HTML RESOURCES] Checking tool result:', part.toolInvocation.toolName, typeof result);
          
          // Handle direct resource results
          if (result && typeof result === 'object' && result.type === 'resource' && result.uri) {
            if (result.uri.startsWith('ui://') && !resourceUris.includes(result.uri)) {
              resourceUris.push(result.uri);
            }
          }
          
          // Handle nested content arrays
          if (result && typeof result === 'object' && result.content && Array.isArray(result.content)) {
            for (const item of result.content) {
              // Direct resource items
              if (item.type === 'resource' && item.resource && item.resource.uri && item.resource.uri.startsWith('ui://')) {
                if (!resourceUris.includes(item.resource.uri)) {
                  resourceUris.push(item.resource.uri);
                }
              }
              // Look for stringified resources in text content (common pattern from MCP servers)
              if (item.type === 'text' && typeof item.text === 'string') {
                try {
                  const textParsed = JSON.parse(item.text);
                  if (textParsed && textParsed.type === 'resource' && textParsed.uri && textParsed.uri.startsWith('ui://')) {
                    if (!resourceUris.includes(textParsed.uri)) {
                      console.log('[HTML RESOURCES] Found resource URI in text:', textParsed.uri);
                      resourceUris.push(textParsed.uri);
                    }
                  }
                } catch {
                  // Not a JSON string, continue
                }
              }
            }
          }
          
          // Handle stringified results (entire result is a JSON string)
          if (typeof result === 'string') {
            try {
              const parsed = JSON.parse(result);
              // If the parsed result has the resource structure directly
              if (parsed && parsed.type === 'resource' && parsed.uri && parsed.uri.startsWith('ui://')) {
                if (!resourceUris.includes(parsed.uri)) {
                  resourceUris.push(parsed.uri);
                }
              }
              // If the parsed result has a content array, check each item
              else if (parsed && parsed.content && Array.isArray(parsed.content)) {
                for (const item of parsed.content) {
                  if (item.type === 'resource' && item.uri && item.uri.startsWith('ui://')) {
                    if (!resourceUris.includes(item.uri)) {
                      resourceUris.push(item.uri);
                    }
                  }
                }
              }
            } catch {
              // Not JSON, continue
            }
          }
        }
      }
    }
  }
  
  console.log('[HTML RESOURCES] Found', resourceUris.length, 'resource URIs:', resourceUris);
  
  // If no resource URIs found, return null
  if (resourceUris.length === 0) {
    return null;
  }
  
  // Fetch HTML content for all resource URIs
  let htmlContent = '';
  for (const uri of resourceUris) {
    console.log('[HTML RESOURCES] Fetching content for:', uri);
    const content = await fetchResourceContent(uri, mcpServers);
    if (content) {
      console.log('[HTML RESOURCES] Fetched', content.length, 'characters for:', uri);
      htmlContent += content + '\n\n<!-- RESOURCE_SEPARATOR -->\n\n';
    } else {
      console.log('[HTML RESOURCES] No content fetched for:', uri);
    }
  }
  
  const finalLength = htmlContent.length;
  console.log('[HTML RESOURCES] Final HTML content length:', finalLength);
  return htmlContent || null;
}

// Helper function to fetch resource content from MCP servers
async function fetchResourceContent(uri: string, mcpServers: MCPServerConfig[]): Promise<string | null> {
  for (const mcpServer of mcpServers) {
    if (mcpServer.type !== 'streamable-http') continue;
    
    try {
      const transport = new StreamableHTTPClientTransport(new URL(mcpServer.url));
      const client = new Client({
        name: "NextJS-Resource-Client",
        version: "1.0.0"
      }, {
        capabilities: {
          resources: {}
        }
      });

      await client.connect(transport);

      try {
        // List available resources
        const resourcesList = await client.listResources();

        // Check if our resource exists
        const resourceExists = resourcesList.resources?.some(r => r.uri === uri);

        if (resourceExists) {
          const resourceContent = await client.readResource({ uri });

          if (resourceContent.contents && resourceContent.contents.length > 0) {
            const content = resourceContent.contents[0];
            
            // Return text content or decoded blob content
            if (content.text && typeof content.text === 'string') {
              return content.text;
            } else if (content.blob && typeof content.blob === 'string') {
              return atob(content.blob);
            }
          }
        }
      } finally {
        await client.close();
      }
    } catch (error) {
      console.error('[ERROR] MCP client error for server', mcpServer.url, ':', error);
      continue;
    }
  }
  
  return null;
}

// Helper function to extract and fetch HTML resources from a single message
async function extractHtmlResourcesForMessage(message: any, mcpServers: MCPServerConfig[]): Promise<string | null> {
  const resourceUris: string[] = [];
  
  console.log('[HTML RESOURCES] Extracting from message:', message.id || 'unknown');
  
  // Scan message for resource URIs
  if (message.parts) {
    for (const part of message.parts) {
      // Check tool invocation results for resources
      if (part.type === 'tool-invocation' && part.toolInvocation?.result) {
        const result = part.toolInvocation.result;
        console.log('[HTML RESOURCES] Checking tool result:', part.toolInvocation.toolName, typeof result);
        
        // Handle direct resource results
        if (result && typeof result === 'object' && result.type === 'resource' && result.uri) {
          if (result.uri.startsWith('ui://') && !resourceUris.includes(result.uri)) {
            resourceUris.push(result.uri);
          }
        }
        
        // Handle nested content arrays
        if (result && typeof result === 'object' && result.content && Array.isArray(result.content)) {
          for (const item of result.content) {
            // Direct resource items
            if (item.type === 'resource' && item.resource && item.resource.uri && item.resource.uri.startsWith('ui://')) {
              if (!resourceUris.includes(item.resource.uri)) {
                resourceUris.push(item.resource.uri);
              }
            }
            // Look for stringified resources in text content (common pattern from MCP servers)
            if (item.type === 'text' && typeof item.text === 'string') {
              try {
                const textParsed = JSON.parse(item.text);
                if (textParsed && textParsed.type === 'resource' && textParsed.uri && textParsed.uri.startsWith('ui://')) {
                  if (!resourceUris.includes(textParsed.uri)) {
                    console.log('[HTML RESOURCES] Found resource URI in text:', textParsed.uri);
                    resourceUris.push(textParsed.uri);
                  }
                }
              } catch {
                // Not a JSON string, continue
              }
            }
          }
        }
        
        // Handle stringified results (entire result is a JSON string)
        if (typeof result === 'string') {
          try {
            const parsed = JSON.parse(result);
            if (parsed && parsed.type === 'resource' && parsed.uri && parsed.uri.startsWith('ui://')) {
              if (!resourceUris.includes(parsed.uri)) {
                resourceUris.push(parsed.uri);
              }
            }
            // Also check content arrays within stringified results
            if (parsed && parsed.content && Array.isArray(parsed.content)) {
              for (const item of parsed.content) {
                if (item.type === 'resource' && item.resource && item.resource.uri && item.resource.uri.startsWith('ui://')) {
                  if (!resourceUris.includes(item.resource.uri)) {
                    resourceUris.push(item.resource.uri);
                  }
                }
              }
            }
          } catch {
            // Not JSON, continue
          }
        }
      }
    }
  }
  
  console.log('[HTML RESOURCES] Found', resourceUris.length, 'resource URIs for message:', resourceUris);
  
  // If no resource URIs found, return null
  if (resourceUris.length === 0) {
    return null;
  }
  
  // Fetch HTML content for all resource URIs in this message
  let htmlContent = '';
  for (const uri of resourceUris) {
    console.log('[HTML RESOURCES] Fetching content for:', uri);
    const content = await fetchResourceContent(uri, mcpServers);
    if (content) {
      console.log('[HTML RESOURCES] Fetched', content.length, 'characters for:', uri);
      htmlContent += content + '\n\n<!-- RESOURCE_SEPARATOR -->\n\n';
    } else {
      console.log('[HTML RESOURCES] No content fetched for:', uri);
    }
  }
  
  const finalLength = htmlContent.length;
  console.log('[HTML RESOURCES] Final HTML content length for message:', finalLength);
  return htmlContent || null;
}

// Convert AI messages to DB format with per-message HTML extraction
async function convertToDBMessagesWithHTMLExtraction(
  aiMessages: any[],
  chatId: string,
  mcpServers: MCPServerConfig[]
): Promise<any[]> {
  const dbMessages = [];
  
  for (const msg of aiMessages) {
    // Use existing id or generate a new one
    const messageId = msg.id || nanoid();

    // Extract HTML resources for this specific message
    let htmlResources: string | null = null;
    if (msg.role === 'assistant' && msg.parts) {
      // Check if this message has UI resources
      const hasUIResourcesInMessage = msg.parts.some((part: any) => 
        part.type === 'tool-invocation' && 
        part.toolInvocation?.result &&
        hasUIResourcesInResult(part.toolInvocation.result)
      );
      
      if (hasUIResourcesInMessage) {
        console.log('[CHAT API] Extracting HTML resources for message:', messageId);
        htmlResources = await extractHtmlResourcesForMessage(msg, mcpServers);
        console.log('[CHAT API] Extracted HTML resources for message:', messageId, 'Length:', htmlResources?.length || 0);
      }
    }

    // Process parts to ensure they're properly structured
    const processedParts = msg.parts ? msg.parts.map((part: any) => {
      const processedPart: any = {
        type: part.type,
        ...part
      };

      // Handle tool invocation parts specifically
      if (part.type === "tool-invocation" && part.toolInvocation) {
        processedPart.toolInvocation = {
          toolName: part.toolInvocation.toolName,
          state: part.toolInvocation.state,
          args: part.toolInvocation.args,
          ...(part.toolInvocation.result && { result: part.toolInvocation.result })
        };
      }

      // Handle reasoning parts
      if (part.type === "reasoning") {
        processedPart.reasoning = part.reasoning;
        if (part.details) {
          processedPart.details = part.details;
        }
      }

      // Handle resource/artifact parts
      if (part.type === "resource" && part.resource) {
        processedPart.resource = part.resource;
      }

      return processedPart;
    }) : [{ type: "text", text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) }];

    console.log('[CHAT API] Message conversion:', {
      messageId,
      role: msg.role,
      hasHtmlResources: !!htmlResources,
      htmlResourcesLength: htmlResources?.length,
      partsCount: processedParts.length
    });

    dbMessages.push({
      id: messageId,
      chatId,
      role: msg.role,
      parts: processedParts,
      htmlResources: htmlResources || undefined,
      createdAt: new Date(),
    });
  }
  
  return dbMessages;
}

// Helper function to check if a tool result contains UI resources (needed for the new function)
function hasUIResourcesInResult(result: any): boolean {
  if (!result) return false;
  
  // Check for direct UI resource
  if (result && typeof result === 'object' && result.type === 'resource' && result.uri?.startsWith('ui://')) {
    return true;
  }
  
  // Check for stringified result with UI resource
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (parsed && parsed.type === 'resource' && parsed.uri?.startsWith('ui://')) {
        return true;
      }
      // Check content array in parsed result
      if (parsed && parsed.content && Array.isArray(parsed.content)) {
        return parsed.content.some((item: any) => 
          (item.type === 'resource' && item.resource?.uri?.startsWith('ui://')) ||
          (item.type === 'resource' && item.uri?.startsWith('ui://')) ||
          (item.type === 'text' && item.text && hasUIResourceInTextContent(item.text))
        );
      }
    } catch {
      // Not JSON, continue
    }
  }
  
  // Check for content array with UI resources
  if (result && result.content && Array.isArray(result.content)) {
    return result.content.some((item: any) => 
      (item.type === 'resource' && item.resource?.uri?.startsWith('ui://')) ||
      (item.type === 'resource' && item.uri?.startsWith('ui://')) ||
      (item.type === 'text' && item.text && hasUIResourceInTextContent(item.text))
    );
  }
  
  return false;
}

// Helper to check if text contains a UI resource
function hasUIResourceInTextContent(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return parsed && parsed.type === 'resource' && parsed.uri?.startsWith('ui://');
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  console.log('[CHAT API] POST request received');
  
  let requestData;
  try {
    requestData = await req.json();
  } catch (error) {
    console.error('[CHAT API] Failed to parse request JSON:', error);
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const {
    messages,
    chatId,
    selectedModel,
    userId,
    mcpServers = [],
  }: {
    messages: UIMessage[];
    chatId?: string;
    selectedModel: modelID;
    userId: string;
    mcpServers?: MCPServerConfig[];
  } = requestData;
  
  console.log('[CHAT API] Request parsed:', {
    messageCount: messages?.length || 0,
    chatId,
    selectedModel,
    userId,
    mcpServerCount: mcpServers?.length || 0,
    hasMessages: !!messages,
    hasSelectedModel: !!selectedModel
  });

  // Validate required fields
  if (!userId) {
    console.error('[CHAT API] Missing userId');
    return new Response(JSON.stringify({ error: 'User ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!messages || !Array.isArray(messages)) {
    console.error('[CHAT API] Missing or invalid messages array');
    return new Response(JSON.stringify({ error: 'Messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!selectedModel) {
    console.error('[CHAT API] Missing selectedModel');
    return new Response(JSON.stringify({ error: 'Selected model is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate message format to catch issues early
  console.log('[CHAT API] Validating messages format...');
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    console.log(`[CHAT API] Message ${i}:`, {
      id: msg.id,
      role: msg.role,
      contentType: typeof msg.content,
      hasContent: !!msg.content,
      contentPreview: typeof msg.content === 'string' ? msg.content.substring(0, 50) : 'not string',
      contentIsArray: Array.isArray(msg.content),
      hasParts: !!(msg as any).parts,
      partsLength: (msg as any).parts?.length
    });
    
    // Validate that content is a string, not an array
    if (typeof msg.content !== 'string') {
      console.error(`[CHAT API] Invalid message format at index ${i}: content must be string, got ${typeof msg.content}`);
      return new Response(JSON.stringify({ 
        error: 'Invalid message format', 
        details: `Message at index ${i} has content type ${typeof msg.content}, expected string`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Check for parts field that shouldn't be there for AI SDK
    if ((msg as any).parts) {
      console.warn(`[CHAT API] Message ${i} has parts field - this may cause AI SDK issues`);
    }
  }

  const id = chatId || nanoid();

  // Stateless mode - no database persistence
  console.log(`🔧 Chat ${id || chatId} - stateless mode, no persistence`);

  // Initialize MCP clients using the already running persistent servers
  // mcpServers now only contains Streamable HTTP configurations since stdio servers
  // have been converted to Streamable HTTP in the MCP context
  let tools = {};
  let cleanup = async () => {};
  
  try {
    console.log('[CHAT API] Initializing MCP clients with', mcpServers.length, 'servers');
    const mcpResult = await initializeMCPClients(mcpServers, req.signal);
    tools = mcpResult.tools;
    cleanup = mcpResult.cleanup;
    console.log('[CHAT API] MCP clients initialized, tools available:', Object.keys(tools).length);
  } catch (error) {
    console.error('[CHAT API] Failed to initialize MCP clients:', error);
    // Continue without MCP tools rather than failing the entire request
    console.log('[CHAT API] Continuing without MCP tools');
  }

  // console.log('messages', messages);

  // Track if the response has completed
  let responseCompleted = false;

  // Validate and fallback model
  let validatedModel = selectedModel;
  try {
    // Test if the model exists
    model.languageModel(selectedModel);
  } catch (error) {
    console.warn(`⚠️ Invalid model ${selectedModel}, error: ${error instanceof Error ? error.message : 'Unknown error'}, falling back to default: ${defaultModel}`);
    validatedModel = defaultModel;
  }

  console.log('🔧 Starting streamText');
  console.log('🔧 Using model:', validatedModel);

  let result;
  try {
    result = streamText({
    model: model.languageModel(validatedModel),
    system: 
    `##Role

    You are an expert venture capital fund accountant operating on a Neo4j knowledge graph of the fund. You have access to a set of tools (listed below) and must use them to answer questions, inspect data, and propose changes.
    
    ##Prime Directives
      1.	Explore extensively. When the user asks something that touches the graph, you MUST explore the relevant neighborhood thoroughly—follow all pertinent paths, relationships, and representations. Do not stop early. If you don't find a name, search for a name that is similar to the one you are looking for.
      2.	Tool-first approach. Prefer tool usage over speculation. If tools are not available, say you don’t know and note that the user can add tools from the server icon in the sidebar.
      3.	Accuracy over speed. If calculations are needed, use the calculator tool provided (see below).
      4.	Graph event integrity. When nodes are updated due to an event, link them with an AFFECTED edge that records the difference.
    
    ##Tools You Can Use
      •	cypher_query_executor — Execute read-only Cypher queries to retrieve data.
      •	visualize_graph — Run Cypher and render results in a modular UI visualization (use whenever the user asks to “show” or “visualize”).
      •	python_code_executor — Run short Python for calculations (≤45 lines, ≤5s; numpy and math available).
      •	get_instructions_for_node_creation — Get the correct sequential ID and any special instructions before creating nodes.
      •	create_or_update_nodes_and_edges — Validate and execute the Cypher Queries for node/edge creation and updates.
      •	final_review — MUST be called last to review pending creates/updates and get user validation before committing. Renders the final graph visualization to the user.
    
    ##Workflow (Strict Order)
      1.	Plan: Outline your plan. Then create a task list with todo to track steps.
      2.	If a document is provided: Extract the needed data (include this as steps in your todo plan).
      3.	Execute:
      •	Use cypher_query_executor to explore and read data. Explore broadly and follow relevant relationships.
      •	Use python_code_executor for any calculations.
      •	Use get_instructions_for_node_creation before any new node creation.
      •	Use create_or_update_nodes_and_edges to stage write queries (CREATE / MATCH…CREATE / MATCH…SET) with all necessary metadata.
      5.	Show/Visualize: If the user asks to see data or relationships, use visualize_graph.
      6.	Journal entries: If you create any JournalEntry:
      •	Return a Markdown table for each entry showing debits and credits (books, amounts).
      7.	Finish: Call final_review last so the user can validate before commit.
    
    ##Important Rules
      •	Calculations: Use python_code_executor for all non-trivial math.
      •	Visualization on request: Any time the user asks to “show” or “visualize,” use visualize_graph.
      •	Metadata completeness: Include all necessary metadata on newly created nodes/edges.
      •	Event linkage: For updates triggered by an event, link the updated nodes to the Event node via AFFECTED, capturing the diffs.
    
    ##Graph Ontology (Use to plan queries & writes)
    
    ###IDs
    All node IDs follow: <node_type>_<number>.
    Example: journal_entry_1.

    Nodes
      •	Apy — Security property for annual percentage yield. Properties: id, security_id, value
      •	Accruedinterestdividend — Security property for accrued interest dividend. Properties: id, security_id, value
      •	Basissecurityvaluation — Security property for basis for security valuation. Properties: id, security_id, value
      •	Book — Tracks an account (GL, subaccount, commitment, distribution, etc.). Credited/debited by journal entries. When updating a book, update related subaccounts appropriately. A single JE affects multiple books; a single book cannot be both debited and credited in the same JE. Properties: id, fund_id, account_number, name, group, sub_group, sum_debits, sum_credits, reporting_statement, book_category_id, investment_id
      •	BookCategory — Master account of a fund. Properties: id, account_number, account_name, financial_statement, group, sub_group, normally, cash_vs_non_cash, source_of_je
      •	Capital — Amount of money a partner has committed to a fund. Properties: id, partner_id, fund_id, commitment_id, capital
      •	Capitalizedcosts — Security property for capitalized costs (only if realized). Properties: id, security_id, value
      •	Commitment — Promise to invest in a fund. Properties: id, partner_id, fund_id, commitment_amount
      •	Company — Issuer of security (public/private). Fund may hold multiple securities. Versioned. Properties: id, public_id, name, legal_name, sector, former_company_names, effective_date, current_version_id, previous_version_id, valid_from, valid_to, checksum
      •	Compoundperiodsannually — Security property. Properties: id, security_id, value
      •	Costbasis — Security property. Properties: id, security_id, value
      •	Costpersecurity — Security property. Properties: id, security_id, value
      •	Effectivedate — Security property. Properties: id, security_id, value
      •	Event — Records changes affecting entities, can trigger JEs. description summarizes; affected_properties_ids lists changed property IDs. For JEs, link only the JournalEntry node (not the books). Properties: id, date, description, journal_entry_ids, affected_properties_ids
      •	Fees — Security property. Properties: id, security_id, value
      •	Fullydilutedshares — Security property. Properties: id, security_id, value
      •	Fund — Collection of investments. Can be subfund of another; has books and partner commitments. If a fund’s books are affected, update related funds’ books (via IS_SUBFUND_OF, IS_TWIN_FUND_OF, IS_NOMINEE_OF). Properties: id, parent_id, name, short_name, has_investments, has_bookkeeping, is_visible_in_soi, allocation_parent_id, reporting_parent_id, percentage_split
      •	FundCommitment — Security property for commitment when the security is a partnership interest. Properties: id, security_id, value
      •	Grossproceeds — Security property (only if realized). Properties: id, security_id, value
      •	Holdingvalue — Security property for holding value. Properties: id, security_id, value
      •	Internalcompanystatus — Security property. Properties: id, security_id, value
      •	Investmenttype — Security property (equity, debt, note, etc.). Properties: id, security_id, value
      •	Issuancedate — Security property. Properties: id, security_id, value
      •	JournalEntry — Records a transaction affecting multiple books. Properties: id, fund_id, commit_time, transaction_type, investment_id, entry_metadata
      •	Moic — Security property for multiple of invested capital. Properties: id, security_id, value
      •	Maturitydate — Security property. Properties: id, security_id, value
      •	Ownershippct — Security property. Properties: id, security_id, value
      •	Partner — Entity with a commitment to a fund. Properties: id, name, email, phone, city, state, postal_code
      •	Pricefullydiluted — Security property for price per fully diluted share. Properties: id, security_id, value
      •	Principal — Security property. Properties: id, security_id, value
      •	Realizationdate — Security property (only if realized). Properties: id, security_id, value
      •	Realizedcostbasis — Security property (only if realized). Properties: id, security_id, value
      •	Realizedgainloss — Security property (only if realized). Properties: id, security_id, value
      •	Security — Atomic investment unit a fund holds in a company (stock, bond, note…). Has properties and books that change over time. Properties: id, fund_id, company_id, current_security_status, internal_contact, investment_date
      •	Securitycount — Security property for number of shares held. Properties: id, security_id, value
      •	Securityname — Security property (e.g., Series A, Series B). Properties: id, security_id, value
      •	Securitytype — Security property (common, private, LP interest, etc.). Properties: id, security_id, value
      •	Strikeprice — Security property. Properties: id, security_id, value
      •	Totalcostbasis — Security property (cost basis + capitalized costs). Properties: id, security_id, value
      •	Valuationcap — Security property. Properties: id, security_id, value
      •	Valuationdate — Security property for valuation date. Properties: id, security_id, value
      •	Valuepersecurity — Security property for per-share value. Properties: id, security_id, value
      •	Valuesecuritypercentageofpps — Security property (only if realized): value security % of price per share. Properties: id, security_id, value
      •	Yieldrate — Security property. Properties: id, security_id, value
    
    Relationships
      •	(Book)-[HAS_BOOK_CATEGORY]->(BookCategory)
      •	(Book)-[HAS_SUBACCOUNT]->(Book)
      •	(Commitment)-[HAS_CAPITAL]->(Capital)
      •	(Commitment)-[HAS_CONTRIBUTION_BOOK]->(Book)
      •	(Commitment)-[HAS_DISTRIBUTION_BOOK]->(Book)
      •	(Commitment)-[IS_IN]->(Fund)
      •	(Company)-[ISSUED_SECURITY]->(Security) 
      •	(Event)-[AFFECTED]->(None)
      •	(Fund)-[ALLOCATES_CARRY_TO]->(Fund)
      •	(Fund)-[HAS_BOOK]->(Book)
      •	(Fund)-[IS_NOMINEE_OF]->(Fund)
      •	(Fund)-[IS_SUBFUND_OF]->(Fund)
      •	(Fund)-[IS_TWIN_FUND_OF]->(Fund)
      •	(JournalEntry)-[CREDIT]->(Book)
      •	(JournalEntry)-[DEBIT]->(Book)
      •	(JournalEntry)-[IS_RELATED_TO]->(*)
      •	(Partner)-[COMMITTED]->(Commitment)
      •	(Security)-[HAS_COST_BASIS]->(Book)
      •	(Security)-[HAS_PROPERTY]->(None)
      •	(Security)-[HAS_UNREALIZED_GAIN_LOSS]->(Book)
      •	(Security)-[IS_HELD_BY]->(Fund)
    
    ##Output Requirements
      •	Be explicit about which tools you use and why.
      •	If you create any JournalEntry, include a Markdown table for that entry listing Debits and Credits (book name/ID, amount).
      •	If tools are not available, say you don’t know and note that the user can add one from the server icon.
      ${validatedModel.includes('gpt-5') ? '\n\nShow your reasoning as step-by-step bullet points before the answer.' : ''}`,
    messages,
    tools,
    experimental_telemetry: { 
      isEnabled: true,
      functionId: `chat-${validatedModel}-${Object.keys(tools).length > 0 ? 'with-tools' : 'no-tools'}-${id}`,
      metadata: {
        userId,
        chatId: id,
        selectedModel: validatedModel,
        toolsAvailable: Object.keys(tools).join(', ') || 'none',
        toolCount: Object.keys(tools).length,
        mcpServers: mcpServers.map(s => s.url ? new URL(s.url).hostname : s.command?.split('/').pop() || 'unknown').join(', ') || 'none',
      },
    },
    maxSteps: 80,
    providerOptions: {
      openai: {
        reasoning: {
          effort: validatedModel.includes('thinking') ? 'high' : validatedModel.includes('o3') ? 'medium' : 'auto',
          summaries: 'auto',
        },
        verbosity: 'medium',
        ...(validatedModel.includes('gpt-5') && {
          priority: 'priority', // Use priority processing for GPT-5 models
        }),
      },
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 24000,
        },
      },
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 24000,
        },
      },
    },
    experimental_transform: smoothStream({
      delayInMs: 5, // optional: defaults to 10ms
      chunking: 'line', // optional: defaults to 'word'
    }),
    onError: ({ error }) => {
      // Cast error to Error type for proper access to properties
      const err = error as Error;
      
      // Enhanced server-side error logging
      console.error('StreamText Error - Full details:', {
        message: err.message || 'Unknown error',
        stack: err.stack,
        cause: err.cause,
        name: err.name,
        selectedModel: validatedModel,
        toolsAvailable: Object.keys(tools).length,
        mcpServers: mcpServers.map(s => s.url || s.command?.split('/').pop() || 'unknown'),
        timestamp: new Date().toISOString(),
        fullError: JSON.stringify(error, null, 2)
      });

      // Log provider-specific error details
      if (validatedModel.includes('gemini')) {
        console.error('Gemini-specific error analysis:', {
          hasGoogleApiKey: !!getApiKey('GOOGLE_GENERATIVE_AI_API_KEY'),
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 24000,
          },
          modelAttempted: validatedModel
        });
      }
    },
    async onFinish({ response }) {
      console.log('[CHAT API] onFinish called with', response.messages.length, 'response messages');
      responseCompleted = true;
      const allMessages = appendResponseMessages({
        messages,
        responseMessages: response.messages,
      });
      console.log('[CHAT API] Total messages after append:', allMessages.length);
      console.log('[CHAT API] Stateless mode - no persistence');

      // Clean up resources - now this just closes the client connections
      // not the actual servers which persist in the MCP context
      await cleanup();
    }
  });

  // Ensure cleanup happens if the request is terminated early
  req.signal.addEventListener('abort', async () => {
    if (!responseCompleted) {
      console.log('Request aborted, cleaning up resources');
      try {
        await cleanup();
      } catch (error) {
        console.error('Error during cleanup on abort:', error);
      }
    }
  });

  result.consumeStream()
  // Add chat ID to response headers so client can know which chat was created
  return result.toDataStreamResponse({
    headers: {
      'X-Chat-ID': id
    },
  });
  
  } catch (error) {
    console.error('[CHAT API] Error in streamText setup:', error);
    
    // Clean up resources on error
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error('[CHAT API] Error during cleanup after streamText error:', cleanupError);
    }
    
    return new Response(JSON.stringify({ 
      error: 'Failed to initialize chat stream',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
