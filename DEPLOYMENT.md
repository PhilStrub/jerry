# Deployment Guide

## After Pushing Code Changes

### For Docker Deployment (Recommended)

When you pull the latest code, follow these steps:

```bash
# 1. Pull the latest code
git pull

# 2. Rebuild the affected container(s)
# For frontend changes only:
docker-compose build frontend

# For backend/agent changes only:
docker-compose build agent

# For changes to both:
docker-compose build

# 3. Restart the containers
docker-compose up -d

# 4. Verify containers are running
docker-compose ps

# 5. Check logs if needed
docker-compose logs -f frontend
```

### For Local Development (Without Docker)

If running locally without Docker:

```bash
# 1. Pull the latest code
git pull

# 2. Install any new dependencies
cd frontend
npm install

# 3. Run the development server
npm run dev
```

The app will be available at http://localhost:3000

---

## Quick Reference

| Scenario | Command |
|----------|---------|
| Frontend code changed | `docker-compose build frontend && docker-compose up -d` |
| Backend code changed | `docker-compose build agent && docker-compose up -d` |
| Dependencies changed | `docker-compose build && docker-compose up -d` |
| View logs | `docker-compose logs -f [service-name]` |
| Stop all services | `docker-compose down` |
| Fresh start | `docker-compose down -v && docker-compose up --build -d` |

---

## Environment Variables

Make sure to set up your `.env` file with:

```bash
OPENROUTER_API_KEY=your_api_key_here
QWEN_MODEL=qwen/qwen3-32b
```

---

## Troubleshooting

**Container won't start?**
```bash
docker-compose logs [service-name]
```

**Need a fresh build?**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Database issues?**
```bash
# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```
