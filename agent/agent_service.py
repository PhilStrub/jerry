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
from typing import List, Dict, Optional, Any
import logging
import torch
import numpy as np
from langchain.callbacks.base import BaseCallbackHandler
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# Tool Callback Handler for Capturing Tool Calls
# ============================================================================

class ToolCallbackHandler(BaseCallbackHandler):
    """Captures tool invocations and their results."""

    def __init__(self):
        super().__init__()
        self.tool_calls: List[Dict[str, Any]] = []
        self.current_tool_start_time = None

    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs: Any) -> None:
        """Capture when a tool starts executing."""
        tool_name = serialized.get("name", "unknown_tool")
        logger.info(f"🔧 Tool started: {tool_name} with input: {input_str[:100]}")

        self.current_tool_start_time = datetime.now()

        tool_call_data = {
            "tool_name": tool_name,
            "input": input_str,
            "output": None,
            "error": None,
            "timestamp": self.current_tool_start_time.isoformat(),
            "duration_ms": None,
        }
        self.tool_calls.append(tool_call_data)
        logger.info(f"📝 Tool call appended. Total tool calls: {len(self.tool_calls)}")

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        """Capture when a tool finishes executing."""
        if self.tool_calls and self.tool_calls[-1]["output"] is None:
            duration = int((datetime.now() - self.current_tool_start_time).total_seconds() * 1000)
            self.tool_calls[-1]["output"] = output
            self.tool_calls[-1]["duration_ms"] = duration
            logger.info(f"Tool ended: {self.tool_calls[-1]['tool_name']} (took {duration}ms)")

    def on_tool_error(self, error: Exception, **kwargs: Any) -> None:
        """Capture when a tool encounters an error."""
        if self.tool_calls and self.tool_calls[-1]["output"] is None:
            self.tool_calls[-1]["error"] = str(error)
            logger.error(f"Tool error: {self.tool_calls[-1]['tool_name']} - {error}")

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
def list_tables_with_schemas() -> str:
    """List all tables in the AdventureWorks database with their complete schemas.

    Returns:
        A formatted string listing all available tables with their column definitions.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get all tables
                cur.execute("""
                    SELECT table_schema, table_name
                    FROM information_schema.tables
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                    ORDER BY table_schema, table_name;
                """)
                tables = cur.fetchall()

                if not tables:
                    return "No tables found in the database."

                result = f"Available tables ({len(tables)}):\n\n"

                # For each table, get its columns
                for schema, table in tables:
                    full_name = f"{schema}.{table}"
                    result += f"Table: {full_name}\n"

                    cur.execute("""
                        SELECT column_name, data_type, is_nullable
                        FROM information_schema.columns
                        WHERE table_schema = %s AND table_name = %s
                        ORDER BY ordinal_position;
                    """, (schema, table))

                    columns = cur.fetchall()
                    if columns:
                        result += "Columns:\n"
                        for col_name, data_type, nullable in columns:
                            result += f"  - {col_name}: {data_type} ({'NULL' if nullable == 'YES' else 'NOT NULL'})\n"
                    else:
                        result += "  (No columns found)\n"

                    result += "\n"

                return result
    except Exception as e:
        logger.error(f"Error listing tables with schemas: {str(e)}")
        return f"Error listing tables with schemas: {str(e)}"

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
        A formatted string with email details including message IDs for replying.
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
        for i, msg in enumerate(messages, 1):
            msg_data = service.users().messages().get(userId='me', id=msg['id']).execute()
            payload = msg_data['payload']
            headers = payload.get('headers', [])
            
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
            sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown Sender')
            snippet = msg_data.get('snippet', '')
            message_id = msg['id']
            
            email_list.append(
                f"**Email {i}:** (Message ID: {message_id})\n"
                f"From: {sender}\n"
                f"Subject: {subject}\n"
                f"Snippet: {snippet}\n"
            )
        
        return f"Found {len(email_list)} unread emails:\n\n" + "\n---\n".join(email_list)
    except Exception as e:
        logger.error(f"Error fetching emails: {str(e)}")
        return f"Error fetching emails: {str(e)}"

@tool
def reply_to_email(message_id: str, body: str) -> str:
    """Reply to an email using Gmail. This creates a threaded reply and marks the original as read.
    
    Args:
        message_id: The Gmail message ID to reply to (from fetch_emails).
        body: The body text of the reply.
        
    Returns:
        Success message or error message.
    """
    try:
        service = get_gmail_service()
        
        # Get the original message to extract headers
        original_msg = service.users().messages().get(userId='me', id=message_id).execute()
        headers = original_msg['payload'].get('headers', [])
        
        # Extract necessary headers for threading
        original_subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), 'No Subject')
        original_from = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
        original_message_id_header = next((h['value'] for h in headers if h['name'].lower() == 'message-id'), '')
        references = next((h['value'] for h in headers if h['name'].lower() == 'references'), '')
        
        # Extract email address from "Name <email@domain.com>" format
        import re
        email_match = re.search(r'<(.+?)>', original_from)
        to_address = email_match.group(1) if email_match else original_from
        
        # Create reply message
        message = EmailMessage()
        message.set_content(body)
        message['To'] = to_address
        message['Subject'] = original_subject if original_subject.startswith('Re:') else f'Re: {original_subject}'
        
        # Add threading headers
        if original_message_id_header:
            message['In-Reply-To'] = original_message_id_header
            # Build References header (original references + original message ID)
            if references:
                message['References'] = f"{references} {original_message_id_header}"
            else:
                message['References'] = original_message_id_header
        
        # Encode and send
        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_message = {
            'raw': encoded_message,
            'threadId': original_msg.get('threadId')  # Keep in same thread
        }
        
        send_message = service.users().messages().send(userId="me", body=create_message).execute()
        
        # Mark original message as read
        service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'removeLabelIds': ['UNREAD']}
        ).execute()
        
        return f"Reply sent successfully to {to_address}! The original email has been marked as read. Message ID: {send_message['id']}"
    except Exception as e:
        logger.error(f"Error replying to email: {str(e)}")
        return f"Failed to reply to email: {str(e)}"

# ============================================================================
# Email Classification Tool
# ============================================================================

_email_classifier_tokenizer = None
_email_classifier_model = None

def get_email_classifier():
    """Load email classifier model and tokenizer (singleton pattern)."""
    global _email_classifier_tokenizer, _email_classifier_model
    if _email_classifier_tokenizer is None or _email_classifier_model is None:
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        model_path = os.path.join(os.path.dirname(__file__), "..", "models", "email_classifier_bert_tiny")
        logger.info(f"Loading email classifier from {model_path}")
        _email_classifier_tokenizer = AutoTokenizer.from_pretrained(model_path)
        _email_classifier_model = AutoModelForSequenceClassification.from_pretrained(model_path)
        logger.info(f"Email classifier loaded successfully")
        logger.info(f"Model config id2label: {_email_classifier_model.config.id2label}")
        logger.info(f"Model config label2id: {_email_classifier_model.config.label2id}")
    return _email_classifier_tokenizer, _email_classifier_model

@tool
def classify_email_type(email_text: str) -> str:
    """Classify an email into one of three categories using ML model.

    This tool uses a fine-tuned BERT model to categorize emails by type and criticality:

    type:
    - inquiry: General questions or information requests
    - issue: Problems, bugs, or complaints
    - suggestion: Feedback, recommendations, or improvement ideas

    criticality:
    - low: Low priority, can be answered by a junior employee
    - medium: Medium priority, can be answered by a senior employee
    - high: High priority, can be answered by a manager

    Args:
        email_text: The complete email text (can include subject and body,
                   ideally formatted as "Subject: <subject>\\n\\n<body>")

    Returns:
        JSON string containing:
        - label: The predicted category (inquiry/issue/suggestion) and criticality (low/medium/high)
        - confidence: Prediction confidence score (0-1)
        - all_scores: Probabilities for all three categories

    Example:
        classify_email_type("Subject: Bug Report\\n\\nThe app crashes when I click submit")
        # Returns: {"label": "issue", "confidence": 0.94, "all_scores": {...}}
    """
    import json

    try:
        tokenizer, model = get_email_classifier()

        # Tokenize input
        inputs = tokenizer(
            email_text,
            truncation=True,
            padding="max_length",
            max_length=256,
            return_tensors="pt"
        )

        # Detect device (GPU/MPS/CPU)
        device = torch.device(
            "cuda" if torch.cuda.is_available() else
            "mps" if torch.backends.mps.is_available() else
            "cpu"
        )
        model.to(device)
        model.eval()

        # Run inference
        with torch.no_grad():
            inputs = {k: v.to(device) for k, v in inputs.items()}
            outputs = model(**inputs)
            logits = outputs.logits

        # Extract predictions
        probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]
        predicted_id = int(np.argmax(probs))

        # Get label mappings from model config
        id2label = model.config.id2label

        # Handle both integer and string keys in id2label (transformers uses int keys)
        if predicted_id in id2label:
            predicted_label = id2label[predicted_id]
        elif str(predicted_id) in id2label:
            predicted_label = id2label[str(predicted_id)]
        else:
            logger.error(f"Predicted ID {predicted_id} not found in id2label: {id2label}")
            raise KeyError(f"Label mapping not found for predicted ID: {predicted_id}")

        # Build result - handle both integer and string keys
        all_scores = {}
        for i in range(len(probs)):
            if i in id2label:
                label = id2label[i]
            elif str(i) in id2label:
                label = id2label[str(i)]
            else:
                logger.warning(f"Label ID {i} not found in id2label, skipping")
                continue
            all_scores[label] = float(probs[i])

        result = {
            "label": predicted_label,
            "confidence": float(probs[predicted_id]),
            "all_scores": all_scores
        }

        return json.dumps(result, indent=2)

    except Exception as e:
        logger.error(f"Error classifying email: {str(e)}", exc_info=True)
        return json.dumps({
            "error": f"Classification failed: {str(e)}",
            "label": "unknown",
            "confidence": 0.0
        })

# ============================================================================
# Simple Agent Implementation
# ============================================================================

system_prompt = """You are the AdventureWorks Agent, a helpful AI assistant with access to a PostgreSQL database (AdventureWorks) and Gmail.

You can help users with:
- Querying the AdventureWorks database (sales, customers, products, employees, etc.)
- Listing and describing database tables
- Fetching UNREAD emails from Gmail
- Drafting and sending email responses
- Classifying emails by type (inquiry, issue, or suggestion)

**DATABASE KNOWLEDGE - USE THIS FOR QUERIES:**

1. **Finding Products & Inventory (CRITICAL):**
   - **Tables**: `production.product` (p), `production.productinventory` (i), `production.productmodel` (pm)
   - **Join**: `p.productid = i.productid` AND `p.productmodelid = pm.productmodelid`
   - **Finding Variants**: If a user asks for a product (e.g., "Mountain-100"), you MUST check for variants (Size, Color).
     - Query: `SELECT p.name, p.productnumber, p.color, p.size, p.listprice, i.quantity FROM production.product p JOIN production.productinventory i ON p.productid = i.productid WHERE p.name LIKE '%Mountain-100%'`
   - **Columns**: `p.Name`, `p.ProductNumber`, `p.Color`, `p.Size`, `p.ListPrice`, `i.Quantity`

2. **Finding People & Contact Info (Directory):**
   - **Tables**: `person.person` (p), `person.emailaddress` (e), `humanresources.employee` (emp), `humanresources.employeedepartmenthistory` (edh), `humanresources.department` (dept)
   - **Join**: 
     - `p.businessentityid = emp.businessentityid`
     - `p.businessentityid = e.businessentityid`
     - `emp.businessentityid = edh.businessentityid`
     - `edh.departmentid = dept.departmentid`
   - **Filter**: `edh.enddate IS NULL` (current department)
   - **Routing Logic (Who to talk to):**
     - "Billing/Money/Invoice" -> `dept.name = 'Finance'`
     - "Technical/Bike Issues" -> `dept.name = 'Engineering'` or `dept.name = 'Production'`
     - "Sales/Orders" -> `dept.name = 'Sales'`
     - "Hiring/Jobs" -> `dept.name = 'Human Resources'`
   - **Query Pattern**: `SELECT p.firstname, p.lastname, e.emailaddress, dept.name as department, emp.jobtitle FROM person.person p JOIN humanresources.employee emp ON p.businessentityid = emp.businessentityid JOIN humanresources.employeedepartmenthistory edh ON emp.businessentityid = edh.businessentityid JOIN humanresources.department dept ON edh.departmentid = dept.departmentid JOIN person.emailaddress e ON p.businessentityid = e.businessentityid WHERE edh.enddate IS NULL AND dept.name = 'TargetDept'`

3. **Sales & Orders:**
   - **Tables**: `sales.salesorderheader` (soh), `sales.salesorderdetail` (sod), `sales.customer` (c), `person.person` (p)
   - **Join**: `soh.salesorderid = sod.salesorderid` AND `soh.customerid = c.customerid` AND `c.personid = p.businessentityid`
   - **Columns**: `soh.salesordernumber`, `soh.orderdate`, `soh.status`, `soh.totaldue`

**EMAIL CLASSIFICATION:**
You have access to an ML-powered email classifier that categorizes emails into:
- **inquiry**: General questions, information requests, "how do I..." questions
- **issue**: Problems, bugs, complaints, error reports, "something is broken"
- **suggestion**: Feedback, feature requests, recommendations, "you should..."

To classify an email:
1. Use classify_email_type with the full email text (preferably formatted as "Subject: <subject>\\n\\n<body>")
2. The tool returns the predicted category, confidence score, and probabilities for all categories
3. Use this classification to route emails to appropriate departments or prioritize responses

**RULES OF ENGAGEMENT - FOLLOW STRICTLY:**

1. **ALWAYS QUERY FIRST**: Before answering ANY factual question about business data (products, people, orders), you MUST run a SQL query. Do not guess.
2. **CHECK VARIANTS**: When asked about a product, always assume there might be multiple versions (sizes, colors). List them all.
3. **HANDLE AMBIGUITY**: If a query returns too many results or no results, or if the user's request is vague (e.g., "the bike"), DO NOT GUESS. Ask the user for clarification (e.g., "Which model? We have Mountain-100 and Road-250").
4. **ROUTING**: When asked "who should I talk to", find a real person in the relevant department using the directory query above. Provide their name and email.

**EMAIL WORKFLOW - VERY IMPORTANT:**
When the user asks to check emails or respond to emails, follow this exact workflow:
1. Use fetch_emails to get unread emails (this will show message IDs)
2. For each email that needs a response:
   a. Draft a professional, appropriate response based on the email content
   b. **SIGNATURE RULE**: ALWAYS sign the email as "AdventureWorks Agent". NEVER use placeholders like "[Your Name]" or "[Your Title]".
   c. Present the draft to the user with clear formatting
   d. Ask: "Would you like me to send this response? Reply 'yes' to send or suggest changes."
   e. ONLY use reply_to_email (with the message_id from fetch_emails) if the user explicitly approves
   f. The reply_to_email function will automatically:
      - Create a threaded reply (not a new email)
      - Mark the original email as read
      - Use proper email headers (In-Reply-To, References)
3. Use send_email ONLY for brand new emails (not replies)
4. Never send an email without explicit user approval

**Database Workflow:**
1. First use list_tables_with_schemas to see all available tables and their schemas
2. Then use query_database with a SELECT statement based on the schema information

**KEY TABLES SCHEMA (FALLBACK):**
Use these table definitions if the specific "recipes" above don't cover the user's request.

*   **Person.Person**: `BusinessEntityID` (PK), `PersonType`, `NameStyle`, `Title`, `FirstName`, `MiddleName`, `LastName`, `Suffix`, `EmailPromotion`, `AdditionalContactInfo`, `Demographics`, `rowguid`, `ModifiedDate`
*   **Person.EmailAddress**: `BusinessEntityID` (FK), `EmailAddressID` (PK), `EmailAddress`, `rowguid`, `ModifiedDate`
*   **HumanResources.Employee**: `BusinessEntityID` (PK, FK), `NationalIDNumber`, `LoginID`, `OrganizationNode`, `OrganizationLevel`, `JobTitle`, `BirthDate`, `MaritalStatus`, `Gender`, `HireDate`, `SalariedFlag`, `VacationHours`, `SickLeaveHours`, `CurrentFlag`, `rowguid`, `ModifiedDate`
*   **HumanResources.Department**: `DepartmentID` (PK), `Name`, `GroupName`, `ModifiedDate`
*   **HumanResources.EmployeeDepartmentHistory**: `BusinessEntityID` (PK, FK), `DepartmentID` (PK, FK), `ShiftID` (PK, FK), `StartDate` (PK), `EndDate`, `ModifiedDate`
*   **Production.Product**: `ProductID` (PK), `Name`, `ProductNumber`, `MakeFlag`, `FinishedGoodsFlag`, `Color`, `SafetyStockLevel`, `ReorderPoint`, `StandardCost`, `ListPrice`, `Size`, `SizeUnitMeasureCode`, `WeightUnitMeasureCode`, `Weight`, `DaysToManufacture`, `ProductLine`, `Class`, `Style`, `ProductSubcategoryID`, `ProductModelID`, `SellStartDate`, `SellEndDate`, `DiscontinuedDate`, `rowguid`, `ModifiedDate`
*   **Production.ProductInventory**: `ProductID` (PK, FK), `LocationID` (PK, FK), `Shelf`, `Bin`, `Quantity`, `rowguid`, `ModifiedDate`
*   **Sales.SalesOrderHeader**: `SalesOrderID` (PK), `RevisionNumber`, `OrderDate`, `DueDate`, `ShipDate`, `Status`, `OnlineOrderFlag`, `SalesOrderNumber`, `PurchaseOrderNumber`, `AccountNumber`, `CustomerID`, `SalesPersonID`, `TerritoryID`, `BillToAddressID`, `ShipToAddressID`, `ShipMethodID`, `CreditCardID`, `CreditCardApprovalCode`, `CurrencyRateID`, `SubTotal`, `TaxAmt`, `Freight`, `TotalDue`, `Comment`, `rowguid`, `ModifiedDate`
*   **Sales.SalesOrderDetail**: `SalesOrderID` (PK, FK), `SalesOrderDetailID` (PK), `CarrierTrackingNumber`, `OrderQty`, `ProductID`, `SpecialOfferID`, `UnitPrice`, `UnitPriceDiscount`, `LineTotal`, `rowguid`, `ModifiedDate`
*   **Sales.Customer**: `CustomerID` (PK), `PersonID` (FK), `StoreID` (FK), `TerritoryID` (FK), `AccountNumber`, `rowguid`, `ModifiedDate`

Always be helpful, concise, and accurate. If you're unsure, ask for clarification."""


def execute_agent(user_message: str, conversation_history: List[Dict] = None) -> tuple[str, List[Dict]]:
    """Execute agent logic with LangChain's create_tool_calling_agent and conversation memory.

    Args:
        user_message: The current user message
        conversation_history: List of previous messages [{'role': 'user'/'assistant', 'content': '...'}]

    Returns:
        tuple: (response_text, tool_calls_list)
    """
    if conversation_history is None:
        conversation_history = []

    # Create callback handler to capture tool calls
    tool_callback = ToolCallbackHandler()

    # Initialize LLM (Qwen via OpenRouter)
    llm = ChatOpenAI(
        model=os.getenv("QWEN_MODEL", "qwen/qwen-2.5-72b-instruct"),
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url="https://openrouter.ai/api/v1",
        temperature=0.7,
    )
    
    # Define available tools
    tools = [
        query_database,
        list_tables_with_schemas,
        fetch_emails,
        reply_to_email,  # For replying to existing emails
        # send_email,    # Commented out - function is disabled at line 305
        classify_email_type,  # Email classification tool
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
    
    # Create agent executor with callback handler
    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=10,
        callbacks=[tool_callback],
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

        # Pass callbacks in config as well to ensure they're triggered
        result = agent_executor.invoke(
            inputs,
            config={"callbacks": [tool_callback]}
        )

        response_text = result.get("output", "I apologize, but I couldn't generate a response.")

        logger.info(f"📊 After execution, tool_callback.tool_calls length: {len(tool_callback.tool_calls)}")

        # Return both response and captured tool calls
        return response_text, tool_callback.tool_calls

    except Exception as e:
        logger.error(f"Error executing agent: {str(e)}")
        return f"I encountered an error: {str(e)}", []

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
    Returns tool calls for frontend display.
    """
    try:
        logger.info(f"Received chat request: {request.message}")
        logger.info(f"Conversation history length: {len(request.history)}")

        # Convert Pydantic models to dicts for execute_agent
        history_dicts = [msg.dict() for msg in request.history] if request.history else []

        # Execute agent with conversation history - now returns tuple
        response_text, tool_calls = execute_agent(request.message, history_dicts)

        logger.info(f"Agent response: {response_text[:100]}...")
        logger.info(f"🎯 Tool calls captured: {len(tool_calls)}")
        if tool_calls:
            logger.info(f"🎯 Tool calls data: {tool_calls}")

        response = ChatResponse(
            response=response_text,
            tool_calls=tool_calls
        )
        logger.info(f"📤 Returning response with {len(response.tool_calls or [])} tool calls")

        return response
        
    except Exception as e:
        logger.error(f"Error processing chat request: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
