output "vpc_id" {
  description = "GreenStay VPC ID."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs for ECS container instances."
  value       = local.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs for the RDS subnet group."
  value       = local.private_subnet_ids
}

output "gateway_endpoint_ids" {
  description = "Gateway endpoint IDs keyed by service."
  value       = { for service, endpoint in aws_vpc_endpoint.gateway : service => endpoint.id }
}

output "ecs_host_security_group_id" {
  description = "Security group ID for the ECS container instances."
  value       = aws_security_group.ecs_host.id
}

output "database_security_group_id" {
  description = "Security group ID for RDS PostgreSQL."
  value       = aws_security_group.database.id
}

output "database_username_parameter_name" {
  description = "SSM parameter name for the database username."
  value       = aws_ssm_parameter.database_username.name
}

output "database_password_parameter_name" {
  description = "SSM parameter name for the database password."
  value       = aws_ssm_parameter.database_password.name
}

output "ecr_repository_url" {
  description = "Image repository URL for the ECS task."
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_repository_arn" {
  description = "Repository ARN for ECS image pull permissions."
  value       = aws_ecr_repository.backend.arn
}

output "postgres_address" {
  description = "Private RDS hostname."
  value       = aws_db_instance.postgres.address
}

output "postgres_port" {
  description = "RDS PostgreSQL port."
  value       = aws_db_instance.postgres.port
}

output "postgres_database_name" {
  description = "PostgreSQL database name."
  value       = aws_db_instance.postgres.db_name
}

output "dynamodb_table_name" {
  description = "On-demand state table name."
  value       = aws_dynamodb_table.state.name
}

output "dynamodb_table_arn" {
  description = "State table ARN for workload permissions."
  value       = aws_dynamodb_table.state.arn
}

output "email_topic_arn" {
  description = "SNS_TOPIC_ARN for publishing email jobs."
  value       = aws_sns_topic.email.arn
}

output "email_queue_url" {
  description = "Email source queue URL."
  value       = aws_sqs_queue.email.url
}

output "email_dlq_url" {
  description = "Email dead-letter queue URL."
  value       = aws_sqs_queue.email_dlq.url
}

output "email_function_name" {
  description = "Lambda function that handles email jobs."
  value       = aws_lambda_function.email.function_name
}

output "ses_sender_email" {
  description = "Sender email to verify in SES."
  value       = aws_ses_email_identity.sender.email
}

output "frontend_bucket_name" {
  description = "Private bucket holding the frontend build under site/."
  value       = aws_s3_bucket.private["frontend"].id
}

output "host_autoscaling_group_name" {
  description = "Auto Scaling group containing the Session Manager target."
  value       = aws_autoscaling_group.host.name
}

output "application_url" {
  description = "Browser URL for the hosted GreenStay app."
  value       = "https://${aws_eip.origin.public_ip}"
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS API service name."
  value       = aws_ecs_service.backend.name
}

output "backend_log_group_name" {
  description = "CloudWatch log group for the ECS API."
  value       = aws_cloudwatch_log_group.backend.name
}

output "cloudtrail_name" {
  description = "CloudTrail management event trail name."
  value       = aws_cloudtrail.management.name
}
