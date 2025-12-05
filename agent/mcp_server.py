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

def get_gmail_service():
    """Authenticates and returns the Gmail API service."""
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing expired token...")
            creds.refresh(Request())
            # Save the refreshed credentials
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
        else:
            raise FileNotFoundError(
                f"Authentication required. Please run 'python setup_gmail_auth.py' locally to generate {TOKEN_FILE}."
            )

    return build('gmail', 'v1', credentials=creds)

def get_db_connection():
    """Establishes a connection to the PostgreSQL database."""
    return psycopg.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        dbname=os.getenv("POSTGRES_DB", "AdventureWorks"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
        port=os.getenv("POSTGRES_PORT", "5432")
    )

@mcp.resource("postgres://schema")
def get_schema() -> str:
    """
    Get the full database schema (tables and columns).
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
                
                schema_text = []
                for schema, table in tables:
                    cur.execute("""
                        SELECT column_name, data_type
                        FROM information_schema.columns
                        WHERE table_schema = %s AND table_name = %s
                        ORDER BY ordinal_position;
                    """, (schema, table))
                    columns = cur.fetchall()
                    
                    col_strs = [f"  {col[0]} ({col[1]})" for col in columns]
                    schema_text.append(f"TABLE {schema}.{table} (\n" + ",\n".join(col_strs) + "\n)")
                
                return "\n\n".join(schema_text)
    except Exception as e:
        return f"Error fetching schema: {str(e)}"

@mcp.tool()
def classify_email(email_body: str) -> str:
    """
    Classify the email content into a category.
    
    Args:
        email_body: The text content of the email.
    """
    # Placeholder logic
    return "Classification: General Inquiry (Placeholder)"

@mcp.tool()
def fetch_emails(limit: int = 5) -> List[Dict[str, str]]:
    """
    Fetch recent emails from the user's Gmail inbox.
    
    Args:
        limit: The maximum number of emails to retrieve (default: 5).
    """
    try:
        service = get_gmail_service()
        results = service.users().messages().list(userId='me', maxResults=limit).execute()
        messages = results.get('messages', [])
        
        email_list = []
        for msg in messages:
            msg_data = service.users().messages().get(userId='me', id=msg['id']).execute()
            payload = msg_data['payload']
            headers = payload.get('headers', [])
            
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
            sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown Sender')
            snippet = msg_data.get('snippet', '')
            
            email_list.append({
                "id": msg['id'],
                "subject": subject,
                "sender": sender,
                "snippet": snippet
            })
            
        return email_list
    except Exception as e:
        return [{"error": str(e)}]

@mcp.tool()
def send_reply(to: str, subject: str, body: str) -> str:
    """
    Send an email reply using Gmail.
    
    Args:
        to: The recipient's email address.
        subject: The subject of the email.
        body: The body text of the email.
    """
    try:
        service = get_gmail_service()
        
        message = EmailMessage()
        message.set_content(body)
        message['To'] = to
        message['Subject'] = subject
        
        # Encode the message
        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_message = {'raw': encoded_message}
        
        send_message = service.users().messages().send(userId="me", body=create_message).execute()
        return f"Email sent successfully! Message Id: {send_message['id']}"
    except Exception as e:
        return f"Failed to send email: {str(e)}"

@mcp.tool()
def query_database(query: str) -> List[Dict]:
    """
    Execute a read-only SQL query against the AdventureWorks database.
    
    Args:
        query: The SQL query to execute. MUST be a SELECT statement.
    """
    if not query.strip().upper().startswith("SELECT"):
        return [{"error": "Only SELECT queries are allowed for safety."}]

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                columns = [desc[0] for desc in cur.description]
                results = []
                for row in cur.fetchall():
                    results.append(dict(zip(columns, row)))
                return results
    except Exception as e:
        return [{"error": str(e)}]

@mcp.tool()
def list_tables() -> List[str]:
    """
    List all tables in the database.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT table_schema || '.' || table_name
                    FROM information_schema.tables
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                    ORDER BY table_schema, table_name;
                """)
                return [row[0] for row in cur.fetchall()]
    except Exception as e:
        return [f"Error listing tables: {str(e)}"]


if __name__ == "__main__":
    import uvicorn
    # Get the SSE app from FastMCP
    app = mcp.sse_app()
    # Run with uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)







