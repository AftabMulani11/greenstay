# GreenStay project context

GreenStay is an AWS SAA-C03 reference deployment in `us-east-1`. Keep the deployment within AWS Free Tier limits. Exclude NAT Gateways, EKS, and Application Load Balancers.

## Target architecture

- `infra/` is the Terraform root for the entire application. `network.tf` defines the `10.0.0.0/16` VPC, public and private subnets across two AZs, gateway endpoints, security groups, and SSM parameters.
- `data.tf` defines ECR, private Single-AZ RDS PostgreSQL on `db.t3.micro`, on-demand DynamoDB with TTL, and the SNS → SQS → Lambda → SES email pipeline. SQS moves a message to the dead-letter queue after three failed receives.
- `compute.tf` runs ECS on one EC2 `t3.micro`. Caddy serves the release from private S3 on the Elastic IP and forwards same-origin API calls to Flask. CloudWatch and CloudTrail cover logging, alarms, and management events.

## Execution order

1. Verify locally with Docker Compose, PostgreSQL, and Mailpit. Format and validate the `infra/` root before an AWS apply.
2. Run `DevOps/deploy.ps1` to prepare the ECR repository and private S3 bucket in the same state, publish both builds, and apply the full stack. Review the apply and verify the SES sender in `us-east-1`.
3. Keep the local state and `infra/release.auto.tfvars.json` for teardown. The private `destroy.local.ps1` script runs the single Terraform destroy and checks that the state is empty.

## Current state

- Use the `demo_url` output after deploying.
- Terraform generates the database password into SSM and reads it for RDS through an ephemeral resource. Both writes use `database_password_version`. Keep the state private because it contains the proxy token and session signing key.
- The deployment pins the backend image by digest and publishes React under `site/<release>/`. The Flask port stays closed to internet traffic. Hotel registration starts a password-free session scoped to the sample property in that browser. Guests use the email entered during check-in in the same browser. Demo emails go to the verified SES inbox.

## Local verification

- Run `docker compose up --build -d --wait` and `./DevOps/smoke-test.ps1` from the project root. Compose selects PostgreSQL and Mailpit SMTP. Nginx serves React and proxies `/api` to Flask.
- Keep the `DB_BACKEND` PostgreSQL/DynamoDB switch and the `EMAIL_TRANSPORT` SMTP/SNS/SQS switch. The AWS SQS event source mapping must enable `ReportBatchItemFailures` and the source queue must redrive failures to its DLQ.
- Refresh the local graph with `graphify update .` after changing code when a local graph exists. Keep generated graph files out of commits. Update `package-lock.json` when frontend dependencies change so Docker can use `npm ci`.

## Repository conventions

- See `greenstay_aws_terraform_deployment_plan.md` for deployment details. Use `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` for targeted lookups when available. Exclude `package-lock.json` and generated graph files from routine source scans.
- Use a natural, human-authored style. Omit tool attributions, watermarks, and co-author tags from code, comments, commit messages, and documentation. Keep comments brief and explain why.
