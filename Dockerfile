FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY agent/ ./agent/
COPY models/ ./models/

RUN pip install --no-cache-dir .

CMD ["uvicorn", "agent.agent_service:app", "--host", "0.0.0.0", "--port", "8000"]
