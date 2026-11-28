# GitHub Actions deployment

The workflows target `AftabMulani11/greenstay`, branch `main`, and the default `greenstay` stack in `us-east-1`. Use a Terraform 1.17.2 CLI for migration and manual plan review, AWS CLI access to the deployment account, and an authenticated GitHub CLI for the GitHub setup commands.

## Bootstrap AWS

From the repository root, run `.\DevOps\bootstrap-ci.ps1` with an authorized AWS session. Review the Terraform plan before approving it. Bootstrap keeps its own local state, reuses an existing GitHub OIDC provider with the STS audience, and creates the two GitHub roles and the versioned, private SSE-S3 state bucket. Keep `bootstrap/terraform.tfstate` private.

## Migrate Terraform state

Pause other runs against `infra/` during migration. Use the workspace that holds the current local state. Keep a copy of the state until you verify the same resource addresses in S3.

1. Read the bootstrap bucket name with `$bucket = terraform '-chdir=bootstrap' output -raw state_bucket`.
2. Back up existing local state with `if (Test-Path -LiteralPath 'infra/terraform.tfstate') { New-Item -ItemType Directory -Force .cache | Out-Null; Copy-Item -LiteralPath 'infra/terraform.tfstate' -Destination ".cache/greenstay-$(Get-Date -Format yyyyMMddHHmmss).tfstate" }`.
3. Activate the backend with `Copy-Item -LiteralPath 'infra/backend.s3.tf.example' -Destination 'infra/backend.s3.tf'`.
4. Run `terraform '-chdir=infra' init -migrate-state "-backend-config=bucket=$bucket"`. Confirm the copy Terraform proposes. For a fresh installation, the same command initializes an empty backend.
5. Verify with `terraform '-chdir=infra' state list`. Migration only copies Terraform's resource records and leaves AWS resources in place.

The workflows enable the same backend template independently. S3 native locking uses `greenstay/terraform.tfstate.tflock`. Use the initialized S3 backend for any fallback run that manages the migrated stack. Keep the GitHub deploy switch off during manual operations. Before a manual plan or fallback deployment, set the same permissions boundary with `$env:TF_VAR_workload_permissions_boundary_arn = terraform '-chdir=bootstrap' output -raw workload_permissions_boundary_arn`.

## Configure GitHub

In **Settings → Environments**, configure these protection rules before setting the deploy switch:

- `production-publish` accepts deployments only from branch `main`. Require a reviewer for artifact publishing and any new artifact destinations.
- `production` accepts deployments only from branch `main`. Require a reviewer for the full release plan. The two environments provide independent approvals.
- `terraform-plan` requires a reviewer for same-repository PRs. Keep the reviewer list limited to people who can inspect the Terraform and workflow code and are authorized to read production state. Fork and Dependabot PRs run the credential-free checks.

Protect `main` with PR review and the CI checks. Use the deploy switch only once the environment approval rules are available and configured.

Run these commands individually from the repository root, or set the same names under **Settings → Secrets and variables → Actions**:

- `gh secret set AWS_DEPLOY_ROLE_ARN --body (terraform '-chdir=bootstrap' output -raw deploy_role_arn) --repo AftabMulani11/greenstay`
- `gh secret set AWS_PLAN_ROLE_ARN --body (terraform '-chdir=bootstrap' output -raw plan_role_arn) --repo AftabMulani11/greenstay`
- `gh secret set SES_SENDER_EMAIL --repo AftabMulani11/greenstay`
- `gh variable set AWS_ACCOUNT_ID --body (aws sts get-caller-identity --query Account --output text) --repo AftabMulani11/greenstay`
- `gh variable set TF_STATE_BUCKET --body (terraform '-chdir=bootstrap' output -raw state_bucket) --repo AftabMulani11/greenstay`

The IAM role ARNs identify which roles GitHub may assume. GitHub OIDC supplies temporary credentials during the jobs.

## Run and review a release

After merging the workflows into `main` and configuring the environments, enable deployments with `gh variable set GREENSTAY_DEPLOY_ENABLED --body true --repo AftabMulani11/greenstay`. Start the first run with `gh workflow run deploy.yml --ref main --repo AftabMulani11/greenstay`. Later pushes to `main` also trigger it.

Review the artifact-destination preview before approving **Publish artifacts and prepare the release plan**. The job verifies that the preview still matches the bootstrap changes, publishes the immutable Git commit tag to ECR, and uploads React under `site/<commit>/` in private S3. It lists Terraform resource changes in the run summary and stores the exact plan in the encrypted state bucket. Use the S3 URI from the summary to read the full plan with authorized AWS credentials:

- Download the bundle with `aws s3 cp 's3://BUCKET/greenstay/plans/RUN-ATTEMPT.tar.gz' .cache/greenstay-release.tar.gz` after creating `.cache` if necessary.
- Display the plan with `tar -xOf .cache/greenstay-release.tar.gz release.plan.txt`.

Review the plan before approving **Apply the reviewed release and verify health**. This job applies the saved plan only while its commit is still at the tip of `main`, then checks the React entry points and Flask `/api/healthz` over HTTPS. Verify the configured SES sender before testing email. Run bundles are private and expire from the state bucket. Keep downloaded copies private because Terraform plans can contain state data.

CI permits the usual ECS task definition replacement. Use a separately reviewed operator plan for resource removals or teardown.
