> **[▶ Live demo](https://aftabmulani11.github.io/greenstay/)** — free demo mode: all APIs are mocked in the browser with sample data (Hotel login `DEMO01`/`demo123`, guest `guest@demo.com`). No AWS resources used.

<div align="center">

# 🏨 GreenStay — Hotel Operations Platform

**Production-style, fault-tolerant cloud architecture: if the email service dies, bookings keep flowing.**

![AWS](https://img.shields.io/badge/AWS-0b0b0e?style=for-the-badge&logo=amazonwebservices&logoColor=FF9900)
![Flask](https://img.shields.io/badge/Flask-0b0b0e?style=for-the-badge&logo=flask&logoColor=white)
![React](https://img.shields.io/badge/React-0b0b0e?style=for-the-badge&logo=react&logoColor=61DAFB)
![Docker](https://img.shields.io/badge/Docker-0b0b0e?style=for-the-badge&logo=docker&logoColor=2496ED)
![Jenkins](https://img.shields.io/badge/Jenkins-0b0b0e?style=for-the-badge&logo=jenkins&logoColor=D24939)

</div>

## Architecture

**4 independent services** — web, API, worker, notification — so a failure in any one never cascades:

```
   ┌─────────────┐    HTTP    ┌─────────────┐   enqueue   ┌─────────────┐   trigger   ┌─────────────┐
   │    WEB      │ ─────────▶ │    API      │ ──────────▶ │   WORKER    │ ──────────▶ │NOTIFICATION │
   │React+Tailwind│           │ Flask REST  │             │  AWS SQS    │             │ Lambda + SES│
   └─────────────┘            └──────┬──────┘             └─────────────┘             └─────────────┘
                                     │                     guaranteed                   email delivery
                                     ▼                     delivery, retries,           fully decoupled
                              ┌─────────────┐              dead-letter safety           from request path
                              │  DynamoDB   │
                              │single-table │
                              │  + GSI      │
                              └─────────────┘
```

### Why the async 3-stage pipeline matters

A hotel booking triggers a confirmation email. Naïve design sends it inline — if SES is slow or down, **the guest's booking request hangs or fails**. GreenStay instead:

1. **API** writes the booking to DynamoDB and drops a message on **SQS** — request returns immediately
2. **SQS** guarantees delivery with retries and dead-letter safety
3. **Lambda** consumes the queue and sends via **SES** — email latency never touches the user

## REST API (9 endpoints)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/login` | POST | Hotel-staff authentication |
| `/api/hotel-registration` | POST | Onboard a new hotel |
| `/api/guests` | POST | Register guest / create booking (enqueues email) |
| `/api/guests/<hotel_id>` | GET | List a hotel's guests |
| `/api/guest-portal/<booking_id>` | GET | Guest self-service portal data |
| `/calculate` | POST | Stay-cost calculation |
| `/api/download/hotel/<hotel_id>` | GET | Hotel data export |
| `/api/download/guest` | POST | Guest data export |

## Data layer

**DynamoDB single-table design** — hotels and guests share one table using `PK`/`SK` composite keys (`HOTEL#id` / `METADATA`, …) with a **GSI on email** for reverse lookups. One table, no joins, predictable single-digit-ms reads.

## CI/CD — 4-stage Jenkins pipeline

```
Checkout ──▶ Build Locally ──▶ Login & Push to ECR ──▶ Deploy to Elastic Beanstalk
```

Docker images for backend and frontend are built from [DevOps/](DevOps/) Dockerfiles, pushed to **ECR**, and deployed to **Elastic Beanstalk** — modeled production-style with AWS credentials injected via Jenkins credentials store.

## Run locally

```bash
docker-compose up --build
# Frontend → http://localhost:3000
# API      → http://localhost:5000
```

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React, Tailwind CSS |
| Backend | Flask (Python), REST |
| Async pipeline | AWS SQS → Lambda → SES |
| Database | DynamoDB (single-table + GSI) |
| Containers | Docker, Docker Compose, Nginx |
| CI/CD | Jenkins → ECR → Elastic Beanstalk |

> 🔒 No credentials in this repo — AWS access is environment-injected; the app degrades gracefully when AWS resources are unavailable.
