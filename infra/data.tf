locals {
  email_function_name   = "${var.project_name}-email"
  email_timeout_seconds = 20
}

ephemeral "aws_ssm_parameter" "database_password" {
  arn             = aws_ssm_parameter.database_password.arn
  with_decryption = true

  depends_on = [aws_ssm_parameter.database_password]
}

resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after seven days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 7
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_db_subnet_group" "database" {
  name       = "${var.project_name}-database"
  subnet_ids = local.private_subnet_ids
}

resource "aws_db_instance" "postgres" {
  identifier                 = "${var.project_name}-postgres"
  engine                     = "postgres"
  engine_version             = "16"
  instance_class             = "db.t3.micro"
  allocated_storage          = 20
  storage_type               = "gp3"
  storage_encrypted          = true
  db_name                    = "greenstay"
  username                   = var.database_username
  password_wo                = ephemeral.aws_ssm_parameter.database_password.value
  password_wo_version        = var.database_password_version
  port                       = 5432
  db_subnet_group_name       = aws_db_subnet_group.database.name
  vpc_security_group_ids     = [aws_security_group.database.id]
  multi_az                   = false
  publicly_accessible        = false
  backup_retention_period    = 0
  skip_final_snapshot        = true
  auto_minor_version_upgrade = true
  engine_lifecycle_support   = "open-source-rds-extended-support-disabled"
}

resource "aws_dynamodb_table" "state" {
  name         = "${var.project_name}-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

resource "aws_sns_topic" "email" {
  name              = local.email_function_name
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sqs_queue" "email_dlq" {
  name                      = "${local.email_function_name}-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "email" {
  name                       = local.email_function_name
  visibility_timeout_seconds = 6 * local.email_timeout_seconds
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.email_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "email_dlq" {
  queue_url = aws_sqs_queue.email_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.email.arn]
  })
}

resource "aws_sqs_queue_policy" "email" {
  queue_url = aws_sqs_queue.email.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.email.arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_sns_topic.email.arn }
      }
    }]
  })
}

resource "aws_sns_topic_subscription" "email_queue" {
  topic_arn            = aws_sns_topic.email.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.email.arn
  raw_message_delivery = true

  depends_on = [aws_sqs_queue_policy.email]
}

resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_email
}

resource "aws_cloudwatch_log_group" "email" {
  name              = "/aws/lambda/${local.email_function_name}"
  retention_in_days = 7
}

resource "aws_iam_role" "email" {
  name = "${local.email_function_name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "email" {
  name = "${local.email_function_name}-delivery"
  role = aws_iam_role.email.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.email.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.email.arn}:log-stream:*"
      },
      {
        Effect   = "Allow"
        Action   = "ses:SendEmail"
        Resource = aws_ses_email_identity.sender.arn
      }
    ]
  })
}

data "archive_file" "email" {
  type        = "zip"
  source_file = "${path.module}/../backend/lambda_email.py"
  output_path = "${path.module}/.terraform/greenstay-email.zip"
}

resource "aws_lambda_function" "email" {
  function_name    = local.email_function_name
  role             = aws_iam_role.email.arn
  handler          = "lambda_email.lambda_handler"
  runtime          = "python3.12"
  filename         = data.archive_file.email.output_path
  source_code_hash = data.archive_file.email.output_base64sha256
  timeout          = local.email_timeout_seconds
  memory_size      = 128

  environment {
    variables = {
      SENDER_EMAIL = aws_ses_email_identity.sender.email
    }
  }

  depends_on = [aws_iam_role_policy.email]
}

resource "aws_lambda_event_source_mapping" "email_queue" {
  event_source_arn        = aws_sqs_queue.email.arn
  function_name           = aws_lambda_function.email.arn
  batch_size              = 5
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 2
  }
}
