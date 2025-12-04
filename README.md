# AdventureWorks Agent - MVP

A simplified AI assistant with LangChain agent, Qwen LLM, and local tools for database queries and Gmail operations.

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
- OpenRouter API key (for Qwen LLM)
- Gmail OAuth credentials (optional, for email tools)

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
```
OPENROUTER_API_KEY=your_openrouter_api_key_here
QWEN_MODEL=qwen/qwen-2.5-72b-instruct
```

### 2. Gmail Setup (Optional)

If you want to use Gmail tools:

1. Place your `credentials.json` in the project root
2. Run the Gmail auth setup:
   ```bash
   python3 setup_gmail_auth.py
   ```
3. This will create `token.json` which will be mounted in the Docker container

### 3. Start the Application

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

The services will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5432

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
- `query_database(query)` - Execute SELECT queries on AdventureWorks
- `list_tables()` - List all available database tables
- `describe_table(table_name)` - Get schema for a specific table

**Gmail Tools:**
- `fetch_emails(limit)` - Fetch recent emails from Gmail
- `send_email(to, subject, body)` - Send emails via Gmail

### Example Queries

Try asking the Agent:
- "List all tables in the database"
- "Show me the schema for the Person.Person table"
- "Query the top 5 customers from sales.customer"
- "Fetch my last 3 emails"
- "Send an email to test@example.com with subject 'Test' and body 'Hello!'"

## Development

### Backend Development

The backend agent service is in `src/jerry/agent_service.py`.

To run locally without Docker:
```bash
pip install -e .
uvicorn jerry.agent_service:app --reload
```

### Frontend Development

The frontend is in the `frontend/` directory.

To run locally without Docker:
```bash
cd frontend
npm install
npm run dev
```

## Database

The AdventureWorks database is automatically initialized when the PostgreSQL container starts for the first time. The SQL scripts in `adventureworks-data/` are executed automatically.

## Architecture Notes

- **Stateless**: No conversation history is maintained between requests
- **Local Tools**: Tools are implemented directly in the backend (not using MCP for now)
- **LangChain**: Agent framework with tool calling
- **Qwen**: LLM via OpenRouter API

## Troubleshooting

### Container Issues

```bash
# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f agent
docker-compose logs -f frontend
docker-compose logs -f postgres

# Restart a specific service
docker-compose restart agent
```

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

- Add MCP client integration (currently tools are local)
- Add conversation memory/history
- Add more tools (e.g., web search, file operations)
- Add streaming responses
- Add authentication to frontend
