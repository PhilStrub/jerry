# Jerry Agent - Demo

A simplified AI assistant with LangChain agent, Qwen LLM, and local tools for database queries and Gmail operations. 

We make use of the AdventureWorks SQL Database as a fictitious e-commerce business. The Agent is able to fetch emails, classify them by type and criticality, perform structured RAG on the company database to retrieve relevant information and send a reply.

## Architecture

```
Frontend (Next.js) → FastAPI Backend → LangChain Agent → Local Tools → PostgreSQL + Gmail
```

**Services:**
- **Frontend**: Next.js chat UI (port 3000)
- **Agent**: FastAPI + LangChain + Qwen (port 8000)
- **PostgreSQL**: AdventureWorks database (port 5432)

## Prerequisites

- Docker and Docker Compose
- IMPORTANT: OpenRouter API key (for Qwen LLM)
- Gmail OAuth credentials (optional, for email tools)
- ports 3000, 8000 and 5432 available

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
```
OPENROUTER_API_KEY=your_openrouter_api_key_here
QWEN_MODEL=qwen/qwen3-32b
```


### 2. Start the Application

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

(this takes a few minutes) 

The services will be available at:
- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:8000>
- PostgreSQL: localhost:5432


### 5. Test the Application

- Send a message from the `email_examples/` folder to [Email: bigdatabocconi25@gmail.com](mailto:bigdatabocconi25@gmail.com).

Open the frontend at <http://localhost:3000>.

Test the **check unread emails** button. Ask any other follow up question concerning products or people of the company.

You will be able to see also the individual tool calls the agent makes.



### 4. Stop the Application

```bash
docker-compose down

# To also remove volumes (fresh database)
docker-compose down -v
```


## Features

### Available Tools

The agent has access to the following tools:

**Database Tools:**
- `query_database(query)` - Execute read-only SELECT queries on the AdventureWorks database
- `list_tables_with_schemas()` - List all available database tables with their complete schemas and column definitions

**Gmail Tools:**
- `fetch_emails(limit)` - Fetch recent UNREAD emails from Gmail inbox (default: 5, max: 20)
- `reply_to_email(message_id, body)` - Reply to an email using its message ID, creates threaded replies and marks original as read

**Email Classification Tools:**
- `classify_email(email_text)` - Classify emails by type (inquiry/issue/suggestion) and criticality (low/medium/high) using fine-tuned BERT models

### Example Queries

Try asking the Agent:
- "List all tables in the database"
- "Show me the schema for the Person.Person table"
- "Query the top 5 customers from sales.customer"
- "Check my unread emails"
- "Classify this email: [paste email text here]"
- "Reply to the email from [sender] about [topic]"
- "Who should I contact about billing issues?"
- "What Mountain-100 bikes do we have in stock?"


## Database

The AdventureWorks database is automatically initialized when the PostgreSQL container starts for the first time. The SQL scripts in `adventureworks-data/` are executed automatically.

## Architecture Notes

- **Stateless**: No conversation history is maintained between requests
- **Local Tools**: Tools are implemented directly in the backend (not using MCP for now)
- **LangChain**: Agent framework with tool calling
- **Qwen**: LLM via OpenRouter API

## Troubleshooting

### Error code: 401 - {'error': {'message': 'User not found.', 'code': 401}}

The cause of the error is the fact that the API key for Openrouter is not valid or is expired. Try putting in the `.env` file a new key.


### Database Issues

If the database isn't initializing:
```bash
# Remove volumes and restart
docker-compose down -v
docker-compose up --build
```

### Gmail Authentication

If Gmail tools aren't working:
1. Ensure `credentials.json` and `token.json` exist
2. Check they're mounted in the container: `docker-compose exec agent ls -la /app/*.json`
3. Re-run `python3 setup_gmail_auth.py` if needed

## Future Enhancements

- Train classification model on proprietary datasets
- Add MCP client integration (currently tools are local)
- Add conversation memory/history
- Add more tools (e.g., web search, file operations)
- Add streaming responses
- Add authentication to frontend
