locals {
  github_provider = "token.actions.githubusercontent.com"
  repository      = "repo:AftabMulani11/greenstay"
  subjects = {
    deploy = ["${local.repository}:environment:production-publish", "${local.repository}:environment:production"]
    plan   = ["${local.repository}:ref:refs/heads/main", "${local.repository}:environment:terraform-plan"]
  }
  oidc_arn = var.existing_github_oidc_provider_arn != "" ? var.existing_github_oidc_provider_arn : one(aws_iam_openid_connect_provider.github[*].arn)
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.existing_github_oidc_provider_arn == "" ? 1 : 0
  url            = "https://${local.github_provider}"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github" {
  for_each             = local.subjects
  name                 = "greenstay-github-actions-${each.key}"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.oidc_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.github_provider}:aud" = "sts.amazonaws.com"
          "${local.github_provider}:sub" = each.value
        }
      }
    }]
  })
}

output "deploy_role_arn" {
  value = aws_iam_role.github["deploy"].arn
}

output "plan_role_arn" {
  value = aws_iam_role.github["plan"].arn
}
