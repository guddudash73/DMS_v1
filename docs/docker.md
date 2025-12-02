# Docker & Environments Guide

This document explains how to run the DMS API with Docker for local development, and how to think about using the same image in test/stage/production with real AWS services.

---

## 1. Local development with Docker

### Prerequisites

- Docker + Docker Compose v2
- Node.js and npm (for local development and Turborepo commands)

### Starting the local stack

From the repo root:

```bash
# Start DynamoDB Local, LocalStack, and the API container
npm run dev:emulators:up

# Or directly:
docker compose -f docker-compose.dev.yml up -d
```
