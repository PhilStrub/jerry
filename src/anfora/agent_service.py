from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.chat_history import InMemoryChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
import psycopg
import os
import base64
from email.message import EmailMessage
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from typing import List, Dict, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AdventureWorks Agent Service")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gmail Configuration
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
CREDENTIALS_FILE = 'credentials.json'
TOKEN_FILE = 'token.json'

# Request/Response Models
class Message(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Message]] = []  # Previous conversation messages

class ChatResponse(BaseModel):
    response: str
    tool_calls: Optional[List[Dict]] = None

# ============================================================================
# Database Tools
# ============================================================================

def get_db_connection():
    """Establishes a connection to the PostgreSQL database."""
    return psycopg.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        dbname=os.getenv("POSTGRES_DB", "AdventureWorks"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
        port=os.getenv("POSTGRES_PORT", "5432")
    )

@tool
def query_database(query: str) -> str:
    """Execute a read-only SQL query against the AdventureWorks database.
    
    Args:
        query: The SQL SELECT query to execute. Only SELECT statements are allowed.
        
    Returns:
        JSON string containing the query results or error message.
    """
    if not query.strip().upper().startswith("SELECT"):
        return "Error: Only SELECT queries are allowed for safety."
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                columns = [desc[0] for desc in cur.description]
                results = []
                for row in cur.fetchall():
                    results.append(dict(zip(columns, row)))
                
                if not results:
                    return "Query executed successfully but returned no results."
                
                # Format results as a readable string
                return f"Found {len(results)} results:\n" + str(results[:10])  # Limit to 10 for readability
    except Exception as e:
        logger.error(f"Database query error: {str(e)}")
        return f"Error executing query: {str(e)}"

@tool
def list_tables() -> str:
    """List all tables in the AdventureWorks database.
    
    Returns:
        A formatted string listing all available tables.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT table_schema || '.' || table_name as full_name
                    FROM information_schema.tables
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                    ORDER BY table_schema, table_name;
                """)
                tables = [row[0] for row in cur.fetchall()]
                return f"Available tables ({len(tables)}):\n" + "\n".join(tables)
    except Exception as e:
        logger.error(f"Error listing tables: {str(e)}")
        return f"Error listing tables: {str(e)}"

@tool
def describe_table(table_name: str) -> str:
    """Get the schema definition for a specific table.
    
    Args:
        table_name: The name of the table (e.g., 'Person.Person' or 'sales.customer').
        
    Returns:
        A formatted string describing the table columns and their types.
    """
    try:
        schema, table = table_name.split('.') if '.' in table_name else ('public', table_name)
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position;
                """, (schema, table))
                
                columns = cur.fetchall()
                if not columns:
                    return f"Table '{table_name}' not found."
                
                result = f"Table: {table_name}\nColumns:\n"
                for col_name, data_type, nullable in columns:
                    result += f"  - {col_name}: {data_type} ({'NULL' if nullable == 'YES' else 'NOT NULL'})\n"
                
                return result
    except Exception as e:
        logger.error(f"Error describing table: {str(e)}")
        return f"Error describing table: {str(e)}"

# ============================================================================
# Gmail Tools
# ============================================================================

def get_gmail_service():
    """Authenticates and returns the Gmail API service."""
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            logger.info("Refreshing expired Gmail token...")
            creds.refresh(Request())
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
        else:
            raise FileNotFoundError(
                f"Gmail authentication required. Please run 'python setup_gmail_auth.py' to generate {TOKEN_FILE}."
            )
    
    return build('gmail', 'v1', credentials=creds)

@tool
def fetch_emails(limit: int = 5) -> str:
    """Fetch recent UNREAD emails from the user's Gmail inbox.
    
    Args:
        limit: The maximum number of emails to retrieve (default: 5, max: 20).
        
    Returns:
        A formatted string with email details (subject, sender, snippet).
    """
    try:
        limit = min(limit, 20)  # Cap at 20 for safety
        service = get_gmail_service()
        # Only fetch unread emails
        results = service.users().messages().list(
            userId='me', 
            maxResults=limit,
            q='is:unread'  # Filter for unread emails only
        ).execute()
        messages = results.get('messages', [])
        
        if not messages:
            return "No unread emails found in inbox."
        
        email_list = []
        for msg in messages:
            msg_data = service.users().messages().get(userId='me', id=msg['id']).execute()
            payload = msg_data['payload']
            headers = payload.get('headers', [])
            
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
            sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown Sender')
            snippet = msg_data.get('snippet', '')
            
            email_list.append(f"From: {sender}\nSubject: {subject}\nSnippet: {snippet}\n")
        
        return f"Found {len(email_list)} unread emails:\n\n" + "\n---\n".join(email_list)
    except Exception as e:
        logger.error(f"Error fetching emails: {str(e)}")
        return f"Error fetching emails: {str(e)}"

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email using Gmail.
    
    Args:
        to: The recipient's email address.
        subject: The subject of the email.
        body: The body text of the email.
        
    Returns:
        Success message with message ID or error message.
    """
    try:
        service = get_gmail_service()
        
        message = EmailMessage()
        message.set_content(body)
        message['To'] = to
        message['Subject'] = subject
        
        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_message = {'raw': encoded_message}
        
        send_message = service.users().messages().send(userId="me", body=create_message).execute()
        return f"Email sent successfully to {to}! Message ID: {send_message['id']}"
    except Exception as e:
        logger.error(f"Error sending email: {str(e)}")
        return f"Failed to send email: {str(e)}"

# ============================================================================
# Simple Agent Implementation
# ============================================================================

system_prompt = """You are the AdventureWorks Agent, a helpful AI assistant with access to a PostgreSQL database (AdventureWorks) and Gmail.

You can help users with:
- Querying the AdventureWorks database (sales, customers, products, employees, etc.)
- Listing and describing database tables
- Fetching UNREAD emails from Gmail
- Drafting and sending email responses

**DATABASE KNOWLEDGE - USE THIS FOR QUERIES:**

1. **Finding People & Contact Info:**
   - Tables: `Person.Person` (p), `Person.EmailAddress` (e), `Person.PersonPhone` (ph)
   - Join: `p.BusinessEntityID = e.BusinessEntityID` AND `p.BusinessEntityID = ph.BusinessEntityID`
   - Columns: `p.FirstName`, `p.LastName`, `e.EmailAddress`, `ph.PhoneNumber`

2. **Finding Employees & Departments (for Support/Routing):**
   - Tables: `HumanResources.Employee` (emp), `HumanResources.EmployeeDepartmentHistory` (edh), `HumanResources.Department` (dept), `Person.Person` (p)
   - Join: `emp.BusinessEntityID = p.BusinessEntityID` AND `emp.BusinessEntityID = edh.BusinessEntityID` AND `edh.DepartmentID = dept.DepartmentID`
   - Filter: `edh.EndDate IS NULL` (current department)
   - Columns: `p.FirstName`, `p.LastName`, `dept.Name` (Department), `emp.JobTitle`
   - **Routing Logic:**
     - "Bike problem" -> Look for 'Engineering' or 'Production' departments
     - "Sales question" -> Look for 'Sales' department
     - "Billing/Money" -> Look for 'Finance' department

3. **Finding Products:**
   - Tables: `Production.Product` (prod), `Production.ProductDescription` (desc), `Production.ProductModelProductDescriptionCulture` (pm)
   - Join: `prod.ProductModelID = pm.ProductModelID` AND `pm.ProductDescriptionID = desc.ProductDescriptionID`
   - Filter: `pm.CultureID = 'en'` (English descriptions)
   - Columns: `prod.Name`, `prod.ProductNumber`, `desc.Description`, `prod.ListPrice`

**EMAIL WORKFLOW - VERY IMPORTANT:**
When the user asks to check emails or respond to emails, follow this exact workflow:
1. Use fetch_emails to get unread emails
2. For each email that needs a response:
   a. Draft a professional, appropriate response based on the email content
   b. Present the draft to the user with clear formatting
   c. Ask: "Would you like me to send this response? Reply 'yes' to send or suggest changes."
   d. ONLY use send_email if the user explicitly approves (says yes/approve/send)
3. Never send an email without explicit user approval

**Database Workflow:**
1. First use list_tables to see available tables
2. Use describe_table to understand the schema
3. Then use query_database with a SELECT statement

Always be helpful, concise, and accurate. If you're unsure, ask for clarification."""


def execute_agent(user_message: str, conversation_history: List[Dict] = None) -> str:
    """Execute agent logic with LangChain's create_tool_calling_agent and conversation memory.
    
    Args:
        user_message: The current user message
        conversation_history: List of previous messages [{'role': 'user'/'assistant', 'content': '...'}]
    """
    if conversation_history is None:
        conversation_history = []
    
    # Initialize LLM (Qwen via OpenRouter)
    llm = ChatOpenAI(
        model=os.getenv("QWEN_MODEL", "qwen/qwen-2.5-72b-instruct"),
        openai_api_key=os.getenv("OPENROUTER_API_KEY"),
        openai_api_base="https://openrouter.ai/api/v1",
        temperature=0.7,
    )
    
    # Define available tools
    tools = [
        query_database,
        list_tables,
        describe_table,
        fetch_emails,
        send_email,
    ]
    
    # Create prompt template
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])
    
    # Create the agent
    agent = create_tool_calling_agent(llm, tools, prompt)
    
    # Create agent executor
    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=10,
    )
    
    # Create chat history
    chat_history = InMemoryChatMessageHistory()
    for msg in conversation_history:
        if msg.get("role") == "user":
            chat_history.add_user_message(msg.get("content"))
        elif msg.get("role") == "assistant":
            chat_history.add_ai_message(msg.get("content"))
            
    # Log the history being passed to the agent
    logger.info(f"Reconstructed Chat History ({len(chat_history.messages)} messages):")
    for m in chat_history.messages:
        logger.info(f" - {m.type}: {m.content[:50]}...")

    try:
        # Execute the agent with chat history
        inputs = {"input": user_message, "chat_history": chat_history.messages}
        logger.info(f"Invoking agent with inputs keys: {inputs.keys()}")
        
        result = agent_executor.invoke(inputs)
        
        return result.get("output", "I apologize, but I couldn't generate a response.")
        
    except Exception as e:
        logger.error(f"Error executing agent: {str(e)}")
        return f"I encountered an error: {str(e)}"

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "AdventureWorks Agent Service"}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat endpoint - processes user messages with LangChain agent.
    
    Supports conversation history for context-aware responses.
    """
    try:
        logger.info(f"Received chat request: {request.message}")
        logger.info(f"Conversation history length: {len(request.history)}")
        
        # Convert Pydantic models to dicts for execute_agent
        history_dicts = [msg.dict() for msg in request.history] if request.history else []
        
        # Execute agent with conversation history
        response_text = execute_agent(request.message, history_dicts)
        
        logger.info(f"Agent response: {response_text}")
        
        return ChatResponse(
            response=response_text,
            tool_calls=None
        )
        
    except Exception as e:
        logger.error(f"Error processing chat request: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
