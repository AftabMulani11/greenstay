# GreenStay — Hotel Operations Platform

A containerized hotel operations platform with an **asynchronous, decoupled AWS email pipeline** — built to model production-style, fault-tolerant cloud architecture.

## Architecture

**4 independent services**, orchestrated with Docker Compose:

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌──────────────┐
│  Web     │ ──▶ │  API     │ ──▶ │  Worker   │ ──▶ │ Notification │
│ (React)  │     │ (Flask)  │     │  (SQS)    │     │ (Lambda+SES) │
└──────────┘     └──────────┘     └───────────┘     └──────────────┘
```

- **9 REST endpoints** (Flask) backing the React frontend
- **Async 3-stage email pipeline** — SQS → Lambda → SES decouples email delivery from the request path; a slow or failing email never blocks a booking
- **DynamoDB** single-table design with GSI for email lookups
- **4-stage Jenkins pipeline** modeling production delivery ([jenkinsfile](jenkinsfile))

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React, Tailwind CSS |
| Backend | Flask (Python), REST |
| Async messaging | AWS SQS, Lambda, SES |
| Database | DynamoDB |
| Containers | Docker, Docker Compose, Nginx |
| CI/CD | Jenkins |

## Run locally

```bash
docker-compose up --build
```

Frontend: `http://localhost:3000` · API: `http://localhost:5000`

> AWS resources (SQS/SES/DynamoDB) require credentials via environment variables — nothing is hardcoded.
