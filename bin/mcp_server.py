from mcp.server.fastmcp import FastMCP
import psycopg
import os
import base64
from email.message import EmailMessage
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from typing import List, Dict, Optional

# Initialize FastMCP server
mcp = FastMCP("Email_Agent")

# Gmail Configuration
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
CREDENTIALS_FILE = 'credentials.json'
TOKEN_FILE = 'token.json'

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

    This tool uses a fine-tuned BERT model to categorize emails as:
    - inquiry: General questions or information requests
    - issue: Problems, bugs, or complaints
    - suggestion: Feedback, recommendations, or improvement ideas

    Args:
        email_text: The complete email text (can include subject and body,
                   ideally formatted as "Subject: <subject>\\n\\n<body>")

    Returns:
        JSON string containing:
        - label: The predicted category (inquiry/issue/suggestion)
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


if __name__ == "__main__":
    import uvicorn
    # Get the SSE app from FastMCP
    app = mcp.sse_app()
    # Run with uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)