locals {
  regional          = "arn:aws"
  scope             = "${local.region}:${local.account}"
  frontend          = "arn:aws:s3:::greenstay-${local.account}-${local.region}-frontend"
  trail_bucket      = "arn:aws:s3:::greenstay-${local.account}-${local.region}-trail"
  state_object      = "${aws_s3_bucket.state.arn}/${local.state_key}"
  lock_object       = "${local.state_object}.tflock"
  repository_arn    = "${local.regional}:ecr:${local.scope}:repository/greenstay-backend"
  mail_topic        = "${local.regional}:sns:${local.scope}:greenstay-email"
  queues            = ["${local.regional}:sqs:${local.scope}:greenstay-email", "${local.regional}:sqs:${local.scope}:greenstay-email-dlq"]
  db_parameter      = "${local.regional}:ssm:${local.scope}:parameter/greenstay/database/password"
  workload_roles    = [for name in ["ecs-host", "ecs-application", "ecs-execution", "email-lambda"] : "arn:aws:iam::${local.account}:role/greenstay-${name}"]
  instance_profile  = "arn:aws:iam::${local.account}:instance-profile/greenstay-ecs-host"
  deployment_region = { StringEquals = { "aws:RequestedRegion" = local.region } }
  release_plans     = "${aws_s3_bucket.state.arn}/greenstay/plans/*"
  logs              = [for name in ["/ecs/greenstay-backend", "/aws/lambda/greenstay-email"] : "${local.regional}:logs:${local.scope}:log-group:${name}*"]
  db                = ["${local.regional}:rds:${local.scope}:db:greenstay-postgres", "${local.regional}:rds:${local.scope}:subgrp:greenstay-database"]
  table             = "${local.regional}:dynamodb:${local.scope}:table/greenstay-state"
  lambda            = "${local.regional}:lambda:${local.scope}:function:greenstay-email"
  mapping           = "${local.regional}:lambda:${local.scope}:event-source-mapping:*"
  ecs               = ["${local.regional}:ecs:${local.scope}:cluster/greenstay", "${local.regional}:ecs:${local.scope}:service/greenstay/greenstay-backend", "${local.regional}:ecs:${local.scope}:task-definition/greenstay-backend:*"]
  alarm             = "${local.regional}:cloudwatch:${local.scope}:alarm:greenstay-*"
  trail             = "${local.regional}:cloudtrail:${local.scope}:trail/greenstay-management"

  shared_state = [
    { Action = ["s3:GetBucketLocation"], Resource = aws_s3_bucket.state.arn },
    {
      Action    = ["s3:ListBucket"]
      Resource  = aws_s3_bucket.state.arn
      Condition = { StringLike = { "s3:prefix" = ["greenstay/*", "env:/"] } }
    },
    { Action = ["s3:GetObject"], Resource = local.state_object },
    { Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = local.lock_object }
  ]
  read_policies = [
    {
      Action = [
        "ec2:Describe*", "autoscaling:Describe*", "sts:GetCallerIdentity",
        "logs:DescribeLogGroups", "cloudwatch:DescribeAlarms", "ecs:DescribeTaskDefinition",
        "lambda:ListEventSourceMappings", "cloudtrail:DescribeTrails",
        "ses:GetIdentityVerificationAttributes", "ses:ListIdentities",
        "rds:DescribeDBEngineVersions", "ssm:DescribeParameters"
      ]
      Resource  = "*"
      Condition = local.deployment_region
    },
    {
      Action   = ["s3:GetBucket*", "s3:GetEncryptionConfiguration", "s3:GetLifecycleConfiguration", "s3:ListBucket"]
      Resource = [local.frontend, local.trail_bucket]
    },
    { Action = ["ecr:DescribeRepositories", "ecr:DescribeImages", "ecr:GetLifecyclePolicy", "ecr:ListTagsForResource"], Resource = local.repository_arn },
    { Action = ["rds:Describe*", "rds:ListTagsForResource"], Resource = local.db },
    { Action = ["dynamodb:DescribeTable", "dynamodb:DescribeTimeToLive", "dynamodb:DescribeContinuousBackups", "dynamodb:ListTagsOfResource"], Resource = local.table },
    { Action = ["ssm:GetParameter"], Resource = [
      "${local.regional}:ssm:${local.scope}:parameter/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id",
      "${local.regional}:ssm:${local.region}::parameter/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id",
      "${local.regional}:ssm:${local.scope}:parameter/greenstay/*"
    ] },
    { Action = ["ssm:ListTagsForResource"], Resource = "${local.regional}:ssm:${local.scope}:parameter/greenstay/*" },
    {
      Action   = ["kms:Decrypt"]
      Resource = "${local.regional}:kms:${local.scope}:key/*"
      Condition = { StringEquals = {
        "kms:ViaService"                      = "ssm.${local.region}.amazonaws.com"
        "kms:EncryptionContext:PARAMETER_ARN" = local.db_parameter
      } }
    },
    { Action = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies", "iam:ListRolePolicies", "iam:ListRoleTags", "iam:ListInstanceProfilesForRole"], Resource = local.workload_roles },
    { Action = ["iam:GetInstanceProfile", "iam:ListInstanceProfileTags"], Resource = local.instance_profile },
    { Action = ["sns:GetTopicAttributes", "sns:ListTagsForResource", "sns:GetSubscriptionAttributes", "sns:ListSubscriptionsByTopic"], Resource = ["${local.regional}:sns:${local.scope}:greenstay-*"] },
    { Action = ["sqs:GetQueueAttributes", "sqs:GetQueueUrl", "sqs:ListQueueTags"], Resource = local.queues },
    { Action = ["ecs:DescribeClusters", "ecs:DescribeServices", "ecs:ListTagsForResource"], Resource = local.ecs },
    { Action = ["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:ListTags", "lambda:GetEventSourceMapping"], Resource = [local.lambda, local.mapping] },
    { Action = ["logs:ListTagsForResource"], Resource = local.logs },
    { Action = ["cloudwatch:ListTagsForResource"], Resource = local.alarm },
    { Action = ["cloudtrail:GetTrail", "cloudtrail:GetTrailStatus", "cloudtrail:GetEventSelectors", "cloudtrail:ListTags"], Resource = local.trail }
  ]

  data_policies = [
    { Action = ["s3:CreateBucket", "s3:PutBucketTagging", "s3:PutBucketPublicAccessBlock", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:PutLifecycleConfiguration"], Resource = [local.frontend, local.trail_bucket] },
    { Action = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], Resource = "${local.frontend}/site/*" },
    { Action = ["ecr:GetAuthorizationToken"], Resource = "*", Condition = local.deployment_region },
    { Action = ["ecr:CreateRepository", "ecr:TagResource", "ecr:UntagResource", "ecr:PutLifecyclePolicy", "ecr:PutImageScanningConfiguration", "ecr:PutImageTagMutability", "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage"], Resource = local.repository_arn },
    { Action = ["rds:CreateDBInstance", "rds:ModifyDBInstance", "rds:CreateDBSubnetGroup", "rds:ModifyDBSubnetGroup", "rds:AddTagsToResource", "rds:RemoveTagsFromResource"], Resource = local.db },
    { Action = ["dynamodb:CreateTable", "dynamodb:UpdateTable", "dynamodb:UpdateTimeToLive", "dynamodb:TagResource", "dynamodb:UntagResource"], Resource = local.table },
    { Action = ["ssm:PutParameter", "ssm:AddTagsToResource", "ssm:RemoveTagsFromResource"], Resource = "${local.regional}:ssm:${local.scope}:parameter/greenstay/*" },
    { Action = ["sns:CreateTopic", "sns:SetTopicAttributes", "sns:Subscribe", "sns:Unsubscribe", "sns:SetSubscriptionAttributes", "sns:TagResource", "sns:UntagResource"], Resource = "${local.regional}:sns:${local.scope}:greenstay-*" },
    { Action = ["sqs:CreateQueue", "sqs:SetQueueAttributes", "sqs:TagQueue", "sqs:UntagQueue"], Resource = local.queues },
    { Action = ["ses:VerifyEmailIdentity"], Resource = "*", Condition = local.deployment_region },
    { Action = ["lambda:CreateFunction", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration", "lambda:TagResource", "lambda:UntagResource"], Resource = local.lambda },
    { Action = ["lambda:CreateEventSourceMapping"], Resource = "*", Condition = { ArnEquals = { "lambda:FunctionArn" = local.lambda } } },
    { Action = ["lambda:UpdateEventSourceMapping", "lambda:DeleteEventSourceMapping", "lambda:UntagResource"], Resource = local.mapping, Condition = local.ec2_tagged },
    { Action = ["lambda:TagResource"], Resource = local.mapping, Condition = local.ec2_create_tagged },
    { Action = ["logs:CreateLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy", "logs:TagResource", "logs:UntagResource", "logs:TagLogGroup", "logs:UntagLogGroup"], Resource = local.logs },
    { Action = ["cloudwatch:PutMetricAlarm", "cloudwatch:TagResource", "cloudwatch:UntagResource"], Resource = local.alarm },
    { Action = ["cloudtrail:CreateTrail", "cloudtrail:UpdateTrail", "cloudtrail:StartLogging", "cloudtrail:StopLogging", "cloudtrail:PutEventSelectors", "cloudtrail:AddTags", "cloudtrail:RemoveTags"], Resource = local.trail }
  ]

  policies = {
    read       = local.read_policies
    plan-state = local.shared_state
    deploy-state = concat(local.shared_state, [
      { Action = ["s3:PutObject"], Resource = local.state_object },
      { Action = ["s3:GetObject", "s3:PutObject"], Resource = local.release_plans }
    ])
    data    = local.data_policies
    compute = local.compute_policies
    network = local.network_policies
    iam     = local.iam_policies
  }
  attachments = {
    "plan-read"    = { role = "plan", policy = "read" }
    "plan-state"   = { role = "plan", policy = "plan-state" }
    "deploy-read"  = { role = "deploy", policy = "read" }
    "deploy-state" = { role = "deploy", policy = "deploy-state" }
    "deploy-data"  = { role = "deploy", policy = "data" }
    "deploy-iam"   = { role = "deploy", policy = "iam" }
    "deploy-ec2"   = { role = "deploy", policy = "network" }
    "deploy-ecs"   = { role = "deploy", policy = "compute" }
  }
}

resource "aws_iam_policy" "github" {
  for_each = local.policies
  name     = "greenstay-github-actions-${each.key}"
  policy   = jsonencode({ Version = "2012-10-17", Statement = [for statement in each.value : merge({ Effect = "Allow" }, statement)] })
}

resource "aws_iam_role_policy_attachment" "github" {
  for_each   = local.attachments
  role       = aws_iam_role.github[each.value.role].name
  policy_arn = aws_iam_policy.github[each.value.policy].arn
}
