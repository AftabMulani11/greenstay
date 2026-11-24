# GreenStay — AWS SAA-C03 Terraform Deployment Plan

- **Project** `AftabMulani11/greenstay` (Hotel Sustainability & Operations Platform)
- **Target region** `us-east-1` (N. Virginia)
**Execution Strategy:** Verify locally, then deploy the single Terraform root in `infra/`.

---

## 1. End-to-End Architecture Overview

The hosted interview demo uses Caddy on the Elastic IP to serve React over HTTPS and forward API requests to Flask.

```text
Browser ── HTTPS ──► Caddy on the ECS EC2 host
                       ├── React build from private S3
                       └── /api/* ──► Flask on ECS ──► Private RDS PostgreSQL
                                           └── SNS ──► SQS ──► Lambda ──► SES
                                                        └── DLQ after three failed receives

The DynamoDB table uses on-demand capacity and TTL. The hosted demo uses PostgreSQL.
```

---

## 2. AWS SAA-C03 Service Mapping & Cost Guardrails

| SAA-C03 Domain | AWS Services Used | Role in GreenStay | Cost & Free-Tier Guardrails |
| :--- | :--- | :--- | :--- |
| **Networking** | VPC (`10.0.0.0/16`), 2 Public Subnets (`us-east-1a/b`), 2 Private Subnets (`us-east-1a/b`), Internet Gateway, **VPC Gateway Endpoints (S3 & DynamoDB)** | Isolates RDS in private subnets while keeping ECS EC2 reachable in public subnets. Gateway Endpoints route S3/DynamoDB traffic privately at $0.00. | **Skip NAT Gateways** (~$32/mo + data charges) and **skip ALBs** (~$16/mo). |
| **Compute & HTTPS** | **S3**, **ECR**, **ECS on EC2 (`t3.micro`) + Auto Scaling Group** | Caddy serves the React build from private S3 and proxies the API to Flask on ECS. | Keep the ASG at one instance and tear down the demo when finished. |
| **Data Tier** | **RDS PostgreSQL (`db.t3.micro`)** + **DynamoDB** | RDS stores hotel, guest, and booking data. Layer 2 also provisions an on-demand DynamoDB table with TTL. | Use single-AZ RDS with a small volume and short backup retention for the demo. |
| **Decoupling & Serverless** | **SNS**, **SQS + Dead-Letter Queue (DLQ)**, **Lambda (`lambda_email.py`)**, **SES** | Fan-out decoupling: backend publishes booking events to SNS → SQS buffers jobs → Lambda processes and sends guest emails via SES. | Always-free monthly allowances cover low-volume Lambda, SQS, SNS, and SES usage. |
| **Security & Identity** | **IAM Roles / Instance Profiles**, **Security Groups**, **SSM Parameter Store + KMS** | Least-privilege IAM roles replace static keys; Security Groups restrict RDS port `5432` strictly to EC2 SG; DB credentials live encrypted in SSM. | Use Standard SSM parameters and AWS-managed KMS keys ($0.00). |
| **Observability** | **CloudWatch Logs & Alarms**, **CloudTrail** | Centralizes ECS/Lambda logs, alerts via SNS on high CPU or SQS DLQ depth > 0, and audits account API activity. | Set explicit CloudWatch log retention (e.g., `7 days`) to stay well under the 5 GB log limit. |

---

## 3. Repository Layout

```text
greenstay/
├── backend/                          # Python API, DB layer, queue publisher, Lambda email handler
│   ├── app.py
│   ├── db.py                         # PostgreSQL and DynamoDB adapter selection
│   ├── queue_service.py
│   ├── Email_templates.py
│   ├── lambda_email.py
│   └── re.txt
├── src/ & public/                    # React frontend
├── DevOps/                           # Dockerfiles, local smoke test, and AWS deploy script
├── greenstay_aws_terraform_deployment_plan.md
└── infra/                            # One Terraform root and state
    ├── network.tf                    # VPC, endpoints, security groups, and SSM parameters
    ├── data.tf                       # ECR, RDS, DynamoDB, and the email pipeline
    ├── compute.tf                    # ECS, EC2, Caddy, S3, CloudWatch, and CloudTrail
    └── Caddyfile
```

---

## 4. Two-Part Execution Workflow

### Part 1: Local Verification (Zero Cloud Spend)
1. **Graph Mapping:** Run `graphify update .` (keep `graphify-out/`, `.graphifyignore`, and `.graphify_analysis.json` in `.gitignore`).
2. **Code Audit:** Trace `src/pages/*` through `backend/app.py`, `backend/db.py`, `queue_service.py`, and `lambda_email.py`.
3. **Local Container Stack:** Run PostgreSQL and Mailpit via `docker-compose.yml` to verify registration, guest entry, dashboards, and email payloads on `localhost`.
4. **Local Terraform Validation:** Run `terraform '-chdir=infra' fmt -check` and `terraform '-chdir=infra' validate`.

### Part 2: Cloud Deployment (`us-east-1`)
1. Run `.\DevOps\deploy.ps1 -SesSenderEmail 'you@example.com'` from the repository root. The first run asks for approval to create the artifact destinations before publishing. The second apply creates the rest of the stack in the same state.
2. Review the HTTPS URL, verify the SES sender email, and follow a sample booking through checkout. The script records the account and release inputs in `infra/release.auto.tfvars.json`. Subsequent deployments can reuse the saved sender.
3. When the demo is finished, run `terraform '-chdir=infra' destroy` from the same workspace. Retain the local state and release inputs until the destroy finishes. The destroy removes ECR images and S3 objects and skips the final RDS snapshot.
