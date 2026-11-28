locals {
  ec2               = "arn:aws:ec2:${local.scope}"
  ec2_tagged        = { StringEquals = { "aws:ResourceTag/Project" = "greenstay" } }
  ec2_create_tagged = { StringEquals = { "aws:RequestTag/Project" = "greenstay" } }
  network_types     = ["vpc", "subnet", "internet-gateway", "route-table", "vpc-endpoint", "security-group", "security-group-rule", "elastic-ip", "launch-template"]
  network_arns      = [for type in local.network_types : "${local.ec2}:${type}/*"]

  network_policies = [
    {
      Action    = ["ec2:CreateVpc", "ec2:CreateSubnet", "ec2:CreateInternetGateway", "ec2:CreateRouteTable", "ec2:CreateVpcEndpoint", "ec2:CreateSecurityGroup", "ec2:AllocateAddress", "ec2:CreateLaunchTemplate"]
      Resource  = local.network_arns
      Condition = local.ec2_create_tagged
    },
    {
      Action    = ["ec2:CreateSubnet", "ec2:CreateRouteTable", "ec2:CreateVpcEndpoint", "ec2:CreateSecurityGroup"]
      Resource  = ["${local.ec2}:vpc/*", "${local.ec2}:route-table/*", "${local.ec2}:subnet/*", "${local.ec2}:security-group/*"]
      Condition = local.ec2_tagged
    },
    {
      Action    = ["ec2:CreateTags"]
      Resource  = local.network_arns
      Condition = { StringEquals = { "aws:RequestTag/Project" = "greenstay", "ec2:CreateAction" = ["CreateVpc", "CreateSubnet", "CreateInternetGateway", "CreateRouteTable", "CreateVpcEndpoint", "CreateSecurityGroup", "AllocateAddress", "CreateLaunchTemplate", "AuthorizeSecurityGroupIngress", "AuthorizeSecurityGroupEgress"] } }
    },
    {
      Action = [
        "ec2:ModifyVpcAttribute", "ec2:ModifySubnetAttribute", "ec2:AttachInternetGateway",
        "ec2:DetachInternetGateway", "ec2:CreateRoute", "ec2:ReplaceRoute", "ec2:DeleteRoute",
        "ec2:AssociateRouteTable", "ec2:ReplaceRouteTableAssociation", "ec2:DisassociateRouteTable",
        "ec2:ModifyVpcEndpoint", "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress", "ec2:ModifySecurityGroupRules",
        "ec2:CreateLaunchTemplateVersion", "ec2:ModifyLaunchTemplate", "ec2:DeleteLaunchTemplateVersions",
        "ec2:CreateTags", "ec2:DeleteTags"
      ]
      Resource  = local.network_arns
      Condition = local.ec2_tagged
    },
    {
      Action    = ["ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress"]
      Resource  = "${local.ec2}:security-group-rule/*"
      Condition = local.ec2_create_tagged
    }
  ]

  compute_policies = [
    {
      Action   = ["autoscaling:CreateAutoScalingGroup", "autoscaling:UpdateAutoScalingGroup", "autoscaling:StartInstanceRefresh", "autoscaling:CancelInstanceRefresh", "autoscaling:CreateOrUpdateTags", "autoscaling:DeleteTags", "autoscaling:EnableMetricsCollection", "autoscaling:DisableMetricsCollection"]
      Resource = "arn:aws:autoscaling:${local.scope}:autoScalingGroup:*:autoScalingGroupName/greenstay-ecs"
    },
    {
      # Auto Scaling checks the launch template with an EC2 dry run.
      Action    = ["ec2:RunInstances"]
      Resource  = ["${local.ec2}:subnet/*", "${local.ec2}:security-group/*", "${local.ec2}:launch-template/*"]
      Condition = local.ec2_tagged
    },
    {
      Action   = ["ec2:RunInstances"]
      Resource = ["arn:aws:ec2:${local.region}::image/*", "${local.ec2}:volume/*", "${local.ec2}:network-interface/*"]
    },
    {
      Action    = ["ec2:RunInstances"]
      Resource  = "${local.ec2}:instance/*"
      Condition = { StringEquals = { "ec2:InstanceType" = "t3.micro", "aws:RequestTag/Name" = "greenstay-ecs-host" } }
    },
    {
      Action    = ["ec2:CreateTags"]
      Resource  = ["${local.ec2}:instance/*", "${local.ec2}:network-interface/*"]
      Condition = { StringEquals = { "ec2:CreateAction" = "RunInstances", "aws:RequestTag/Name" = "greenstay-ecs-host" } }
    },
    { Action = ["ecs:CreateCluster", "ecs:PutClusterCapacityProviders", "ecs:UpdateCluster", "ecs:UpdateClusterSettings", "ecs:TagResource", "ecs:UntagResource"], Resource = local.ecs },
    { Action = ["ecs:CreateService", "ecs:UpdateService", "ecs:RegisterTaskDefinition"], Resource = local.ecs },
    { Action = ["ecs:DeregisterTaskDefinition"], Resource = "*", Condition = local.deployment_region }
  ]

  iam_policies = [
    {
      Action    = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"]
      Resource  = local.workload_roles
      Condition = { ArnEquals = { "iam:PermissionsBoundary" = aws_iam_policy.workload_boundary.arn } }
    },
    { Action = ["iam:TagRole", "iam:UntagRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy", "iam:DeleteRolePolicy"], Resource = local.workload_roles },
    {
      Action    = ["iam:PutRolePolicy"]
      Resource  = local.workload_roles
      Condition = { StringEquals = { "aws:ResourceTag/Project" = "greenstay" } }
    },
    {
      Action   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
      Resource = "arn:aws:iam::${local.account}:role/greenstay-ecs-host"
      Condition = { ArnEquals = { "iam:PolicyARN" = [
        "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
      ] } }
    },
    { Action = ["iam:CreateInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile", "iam:UntagInstanceProfile"], Resource = local.instance_profile },
    {
      Action    = ["iam:PassRole"]
      Resource  = local.workload_roles
      Condition = { StringEquals = { "iam:PassedToService" = ["ec2.amazonaws.com", "ecs-tasks.amazonaws.com", "lambda.amazonaws.com"] } }
    },
    {
      Action    = ["iam:PassRole"]
      Resource  = "arn:aws:iam::${local.account}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling"
      Condition = { StringEquals = { "iam:PassedToService" = "autoscaling.amazonaws.com" } }
    },
    {
      Action   = ["iam:CreateServiceLinkedRole"]
      Resource = "arn:aws:iam::${local.account}:role/aws-service-role/*"
      Condition = { StringEquals = { "iam:AWSServiceName" = [
        "autoscaling.amazonaws.com", "ecs.amazonaws.com", "rds.amazonaws.com"
      ] } }
    }
  ]
}

resource "aws_iam_policy" "workload_boundary" {
  name = "greenstay-workload-boundary"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RegisterContainerInstance", "ecs:DeregisterContainerInstance", "ecs:DiscoverPollEndpoint",
          "ecs:Poll", "ecs:StartTelemetrySession", "ecs:Submit*", "ecs:UpdateContainerInstancesState",
          "ecr:GetAuthorizationToken", "ssm:UpdateInstanceInformation", "ssmmessages:*", "ec2messages:*"
        ]
        Resource  = "*"
        Condition = local.deployment_region
      },
      { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"], Resource = local.repository_arn },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = local.logs },
      { Effect = "Allow", Action = ["s3:ListBucket", "s3:GetObject"], Resource = [local.frontend, "${local.frontend}/site/*"] },
      { Effect = "Allow", Action = ["ssm:GetParameter", "ssm:GetParameters"], Resource = "${local.regional}:ssm:${local.scope}:parameter/greenstay/*" },
      { Effect = "Allow", Action = ["ssm:GetDocument", "ssm:DescribeDocument"], Resource = ["${local.regional}:ssm:${local.region}::document/AWS-*", "${local.regional}:ssm:${local.scope}:document/AWS-*"] },
      { Effect = "Allow", Action = ["sns:Publish"], Resource = local.mail_topic },
      {
        Effect    = "Allow"
        Action    = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource  = "${local.regional}:kms:${local.scope}:key/*"
        Condition = { StringEquals = { "kms:ViaService" = ["sns.${local.region}.amazonaws.com", "ssm.${local.region}.amazonaws.com"] } }
      },
      { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = local.queues },
      { Effect = "Allow", Action = ["ses:SendEmail"], Resource = "${local.regional}:ses:${local.scope}:identity/*" },
      { Effect = "Allow", Action = ["ec2:AssociateAddress"], Resource = ["${local.ec2}:elastic-ip/*", "${local.ec2}:network-interface/*", "${local.ec2}:instance/*"] }
    ]
  })
}

output "workload_permissions_boundary_arn" {
  value = aws_iam_policy.workload_boundary.arn
}
