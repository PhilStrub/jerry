FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .

# Install PyTorch from pre-built wheels first (much faster)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Create dummy structure
RUN mkdir -p agent models

# Install remaining dependencies
RUN pip install --no-cache-dir -e .

COPY agent/ ./agent/
COPY models/ ./models/

CMD ["uvicorn", "agent.agent_service:app", "--host", "0.0.0.0", "--port", "8000"]