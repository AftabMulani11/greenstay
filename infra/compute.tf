locals {
  account_id  = data.aws_caller_identity.current.account_id
  arn_prefix  = "arn:${data.aws_partition.current.partition}"
  bucket_base = "${var.project_name}-${local.account_id}-${local.region}"
  trail_name  = "${var.project_name}-management"
  trail_arn   = "${local.arn_prefix}:cloudtrail:${local.region}:${local.account_id}:trail/${local.trail_name}"
  api_port    = 5000

  task_secret_names = {
    PGUSER                  = aws_ssm_parameter.database_username.name
    PGPASSWORD              = aws_ssm_parameter.database_password.name
    CLOUDFRONT_ORIGIN_TOKEN = aws_ssm_parameter.origin_token.name
    DEMO_SESSION_KEY        = aws_ssm_parameter.demo_session_key.name
  }
  task_secret_arns = {
    for name, path in local.task_secret_names :
    name => "${local.arn_prefix}:ssm:${local.region}:${local.account_id}:parameter${path}"
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

resource "aws_eip" "origin" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-api-origin" }
}

resource "aws_security_group" "origin" {
  name        = "${var.project_name}-web"
  description = "Public HTTPS and certificate validation"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.origin.id
  description       = each.key == "80" ? "ACME validation and HTTPS redirect" : "GreenStay demo HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.key)
  to_port           = tonumber(each.key)
}

resource "random_password" "origin_token" {
  length  = 40
  special = false
}

resource "aws_ssm_parameter" "origin_token" {
  name        = "/${var.project_name}/edge/origin-token"
  description = "Shared header for the Caddy to Flask proxy"
  type        = "SecureString"
  tier        = "Standard"
  value       = random_password.origin_token.result
}

resource "random_password" "demo_session_key" {
  length  = 40
  special = false
}

resource "aws_ssm_parameter" "demo_session_key" {
  name        = "/${var.project_name}/demo/session-key"
  description = "Signing key for isolated browser demo sessions"
  type        = "SecureString"
  tier        = "Standard"
  value       = random_password.demo_session_key.result
}

resource "aws_iam_role" "host" {
  name = "${var.project_name}-ecs-host"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_host" {
  role       = aws_iam_role.host.name
  policy_arn = "${local.arn_prefix}:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "session_manager" {
  role       = aws_iam_role.host.name
  policy_arn = "${local.arn_prefix}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "serve_frontend" {
  name = "serve-frontend"
  role = aws_iam_role.host.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "s3:ListBucket"
        Resource  = aws_s3_bucket.private["frontend"].arn
        Condition = { StringLike = { "s3:prefix" = "site/*" } }
      },
      {
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.private["frontend"].arn}/site/*"
      },
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = aws_ssm_parameter.origin_token.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "associate_origin_address" {
  name = "associate-origin-address"
  role = aws_iam_role.host.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ec2:AssociateAddress"
        Resource = aws_eip.origin.arn
      },
      {
        Effect = "Allow"
        Action = "ec2:AssociateAddress"
        Resource = [
          "${local.arn_prefix}:ec2:${local.region}:${local.account_id}:instance/*",
          "${local.arn_prefix}:ec2:${local.region}:${local.account_id}:network-interface/*"
        ]
        Condition = {
          StringEquals = { "ec2:ResourceTag/Name" = "${var.project_name}-ecs-host" }
        }
      }
    ]
  })
}

resource "aws_iam_instance_profile" "host" {
  name = "${var.project_name}-ecs-host"
  role = aws_iam_role.host.name
}

resource "aws_iam_role" "task" {
  for_each = toset(["execution", "application"])
  name     = "${var.project_name}-ecs-${each.key}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.account_id }
        ArnLike      = { "aws:SourceArn" = "${local.arn_prefix}:ecs:${local.region}:${local.account_id}:*" }
      }
    }]
  })
}

resource "aws_iam_role_policy" "task_execution" {
  name = "start-backend"
  role = aws_iam_role.task["execution"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
        Resource = aws_ecr_repository.backend.arn
      },
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameters"
        Resource = values(local.task_secret_arns)
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.backend.arn}:log-stream:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_application" {
  name = "publish-email-events"
  role = aws_iam_role.task["application"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "sns:Publish"
        Resource = aws_sns_topic.email.arn
      },
      {
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = "${local.arn_prefix}:kms:${local.region}:${local.account_id}:key/*"
        Condition = {
          StringEquals = {
            "kms:ViaService"                         = "sns.${local.region}.amazonaws.com"
            "kms:EncryptionContext:aws:sns:topicArn" = aws_sns_topic.email.arn
          }
          "ForAnyValue:StringEquals" = {
            "kms:ResourceAliases" = "alias/aws/sns"
          }
        }
      }
    ]
  })
}

resource "aws_ecs_cluster" "main" {
  name = var.project_name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_launch_template" "host" {
  name_prefix   = "${var.project_name}-ecs-"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = "t3.micro"

  iam_instance_profile {
    name = aws_iam_instance_profile.host.name
  }

  network_interfaces {
    associate_public_ip_address = true
    delete_on_termination       = true
    device_index                = 0
    security_groups             = [aws_security_group.ecs_host.id, aws_security_group.origin.id]
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  credit_specification {
    cpu_credits = "standard"
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_type           = "gp3"
      volume_size           = 30
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.project_name}-ecs-host" }
  }

  tag_specifications {
    resource_type = "network-interface"
    tags          = { Name = "${var.project_name}-ecs-host" }
  }

  user_data = base64encode(replace(<<-BASH
    #!/bin/bash
    set -euo pipefail

    export AWS_MAX_ATTEMPTS=6
    export AWS_RETRY_MODE=standard
    if ! command -v aws >/dev/null; then
      dnf install -y awscli-2
    fi
    if ! rpm -q amazon-ssm-agent >/dev/null; then
      dnf install -y 'https://s3.${local.region}.amazonaws.com/amazon-ssm-${local.region}/latest/linux_amd64/amazon-ssm-agent.rpm'
    fi
    systemctl enable --now --no-block amazon-ssm-agent
    token=$(curl --fail --silent --show-error --retry 5 -X PUT \
      -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
    instance_id=$(curl --fail --silent --show-error --retry 5 \
      -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id)

    # Keep the origin address stable when the Auto Scaling group replaces a host.
    for attempt in {1..12}; do
      if aws ec2 associate-address --region '${local.region}' --instance-id "$instance_id" \
        --allocation-id '${aws_eip.origin.id}' --allow-reassociation; then
        printf '%s\n' 'ECS_CLUSTER=${aws_ecs_cluster.main.name}' 'ECS_ENABLE_TASK_IAM_ROLE=true' \
          'ECS_ENABLE_AWSLOGS_EXECUTIONROLE_OVERRIDE=true' >> /etc/ecs/ecs.config
        systemctl enable --now --no-block ecs
        break
      fi
      if [ "$attempt" -eq 12 ]; then exit 1; fi
      sleep 5
    done

    install -d -m 0755 /opt/greenstay/site
    cat > /opt/greenstay/Caddyfile <<'CADDY'
    ${file("${path.module}/Caddyfile")}
    CADDY
    cat > /opt/greenstay/start-web <<'STARTWEB'
    #!/bin/bash
    set -euo pipefail
    umask 077
    export AWS_DEFAULT_REGION='${local.region}' AWS_MAX_ATTEMPTS=6
    aws s3 sync 's3://${aws_s3_bucket.private["frontend"].id}/site/${coalesce(var.frontend_release, "pending")}/' /opt/greenstay/site/ --exact-timestamps --only-show-errors
    test -s /opt/greenstay/site/index.html
    chmod -R a+rX /opt/greenstay/site
    image='docker.io/library/caddy:2.11.8-alpine@sha256:f6228111e5fafa1a5238258d0858e103f10599b8d1659a146e7726681a002bb9'
    docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
    origin_token=$(aws ssm get-parameter --name '${aws_ssm_parameter.origin_token.name}' --with-decryption --query 'Parameter.Value' --output text)
    export ORIGIN_TOKEN="$origin_token" DEMO_IP='${aws_eip.origin.public_ip}'
    exec docker run --rm --name greenstay-web --network host \
      --env ORIGIN_TOKEN --env DEMO_IP \
      --volume /opt/greenstay/Caddyfile:/etc/caddy/Caddyfile:ro \
      --volume /opt/greenstay/site:/srv:ro --volume greenstay-caddy-data:/data "$image"
    STARTWEB
    chmod 0700 /opt/greenstay/start-web
    cat > /etc/systemd/system/greenstay-web.service <<'SERVICE'
    [Unit]
    Description=GreenStay HTTPS demo
    Wants=network-online.target
    Requires=docker.service
    After=network-online.target docker.service

    [Service]
    ExecStart=/opt/greenstay/start-web
    ExecStop=/usr/bin/docker stop greenstay-web
    Restart=always
    RestartSec=20s

    [Install]
    WantedBy=multi-user.target
    SERVICE
    systemctl daemon-reload
    systemctl enable --now --no-block greenstay-web
  BASH
  , "\r\n", "\n"))
}

resource "aws_autoscaling_group" "host" {
  name                = "${var.project_name}-ecs"
  min_size            = 1
  desired_capacity    = 1
  max_size            = 1
  vpc_zone_identifier = local.public_subnet_ids
  health_check_type   = "EC2"

  launch_template {
    id      = aws_launch_template.host.id
    version = aws_launch_template.host.latest_version
  }

  instance_refresh {
    strategy = "Rolling"

    preferences {
      min_healthy_percentage = 0
      max_healthy_percentage = 100
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.ecs_host,
    aws_iam_role_policy_attachment.session_manager,
    aws_iam_role_policy.associate_origin_address,
    aws_iam_role_policy.serve_frontend,
    aws_route.public_internet,
    aws_route_table_association.subnet,
    aws_vpc_security_group_egress_rule.ecs_https,
  ]
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project_name}-backend"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project_name}-backend"
  requires_compatibilities = ["EC2"]
  network_mode             = "bridge"
  execution_role_arn       = aws_iam_role.task["execution"].arn
  task_role_arn            = aws_iam_role.task["application"].arn

  lifecycle {
    precondition {
      condition     = var.backend_image_digest != null && var.frontend_release != null
      error_message = "Publish the backend image and frontend build before applying the full stack. Run DevOps/deploy.ps1."
    }
  }

  container_definitions = jsonencode([{
    name              = "backend"
    image             = var.backend_image_digest == null ? null : "${aws_ecr_repository.backend.repository_url}@${var.backend_image_digest}"
    essential         = true
    cpu               = 256
    memory            = 512
    memoryReservation = 384
    command           = ["gunicorn", "-w", "1", "--threads", "2", "-b", "0.0.0.0:${local.api_port}", "app:app"]
    portMappings      = [{ containerPort = local.api_port, hostPort = local.api_port, protocol = "tcp" }]

    environment = [
      for name, value in {
        DB_BACKEND           = "postgres"
        PGHOST               = aws_db_instance.postgres.address
        PGPORT               = tostring(aws_db_instance.postgres.port)
        PGDATABASE           = aws_db_instance.postgres.db_name
        PGSSLMODE            = "require"
        EMAIL_TRANSPORT      = "sns"
        SNS_TOPIC_ARN        = aws_sns_topic.email.arn
        AWS_REGION_NAME      = local.region
        PUBLIC_DEMO          = "true"
        DEMO_EMAIL_RECIPIENT = aws_ses_email_identity.sender.email
      } : { name = name, value = value }
    ]

    secrets = [
      for name, arn in local.task_secret_arns : { name = name, valueFrom = arn }
    ]

    healthCheck = {
      command = [
        "CMD", "python", "-c",
        "from urllib.request import urlopen; urlopen('http://127.0.0.1:${local.api_port}/healthz', timeout=3).close()"
      ]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "backend"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "${var.project_name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  launch_type     = "EC2"
  desired_count   = 1

  # One host port is available, so a replacement task starts after the old task stops.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  wait_for_steady_state              = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [
    aws_autoscaling_group.host,
    aws_iam_role_policy.task_execution,
    aws_iam_role_policy.task_application,
    aws_vpc_security_group_egress_rule.ecs_postgres,
    aws_vpc_security_group_ingress_rule.database_postgres,
  ]
}

resource "aws_s3_bucket" "private" {
  for_each      = toset(["frontend", "trail"])
  bucket        = "${local.bucket_base}-${each.key}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "private" {
  for_each = aws_s3_bucket.private
  bucket   = each.value.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_sns_topic" "alarms" {
  count = var.alarm_email == null ? 0 : 1
  name  = "${var.project_name}-alarms"
}

resource "aws_sns_topic_subscription" "alarms" {
  count     = var.alarm_email == null ? 0 : 1
  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "host_cpu" {
  alarm_name          = "${var.project_name}-ecs-high-cpu"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = aws_sns_topic.alarms[*].arn

  dimensions = { AutoScalingGroupName = aws_autoscaling_group.host.name }
}

resource "aws_cloudwatch_metric_alarm" "email_dlq" {
  alarm_name          = "${var.project_name}-email-dlq-messages"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = aws_sns_topic.alarms[*].arn

  dimensions = { QueueName = basename(aws_sqs_queue.email_dlq.url) }
}

resource "aws_s3_bucket_lifecycle_configuration" "trail" {
  bucket = aws_s3_bucket.private["trail"].id

  rule {
    id     = "expire-management-logs"
    status = "Enabled"

    filter {
      prefix = "AWSLogs/"
    }

    expiration {
      days = 30
    }
  }
}

resource "aws_s3_bucket_policy" "trail" {
  bucket = aws_s3_bucket.private["trail"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.private["trail"].arn
        Condition = {
          StringEquals = { "aws:SourceArn" = local.trail_arn }
        }
      },
      {
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.private["trail"].arn}/AWSLogs/${local.account_id}/*"
        Condition = {
          StringEquals = {
            "aws:SourceArn" = local.trail_arn
            "s3:x-amz-acl"  = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

resource "aws_cloudtrail" "management" {
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.private["trail"].id
  include_global_service_events = true
  is_multi_region_trail         = false
  enable_log_file_validation    = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  depends_on = [aws_s3_bucket_policy.trail]
}
