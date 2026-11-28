ephemeral "random_password" "database" {
  length  = 32
  special = false
}

locals {
  region = "us-east-1"
  subnets = {
    public_a  = { az = "us-east-1a", cidr = "10.0.0.0/24", public = true }
    public_b  = { az = "us-east-1b", cidr = "10.0.1.0/24", public = true }
    private_a = { az = "us-east-1a", cidr = "10.0.10.0/24", public = false }
    private_b = { az = "us-east-1b", cidr = "10.0.11.0/24", public = false }
  }
  public_subnet_ids  = [for key, subnet in aws_subnet.main : subnet.id if local.subnets[key].public]
  private_subnet_ids = [for key, subnet in aws_subnet.main : subnet.id if !local.subnets[key].public]
  database_path      = "/${var.project_name}/database"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = var.project_name }
}

resource "aws_subnet" "main" {
  for_each = local.subnets

  vpc_id            = aws_vpc.main.id
  availability_zone = each.value.az
  cidr_block        = each.value.cidr

  tags = { Name = "${var.project_name}-${replace(each.key, "_", "-")}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project_name}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project_name}-public" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project_name}-private" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "subnet" {
  for_each = local.subnets

  subnet_id      = aws_subnet.main[each.key].id
  route_table_id = each.value.public ? aws_route_table.public.id : aws_route_table.private.id
}

resource "aws_vpc_endpoint" "gateway" {
  for_each = toset(["s3", "dynamodb"])

  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${local.region}.${each.key}"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.private.id]

  tags = { Name = "${var.project_name}-${each.key}" }
}

resource "aws_security_group" "ecs_host" {
  name        = "${var.project_name}-ecs-host"
  description = "Traffic for ECS container instances"
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "database" {
  name        = "${var.project_name}-database"
  description = "PostgreSQL traffic from ECS container instances"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "api_https" {
  for_each = var.api_https_ingress_cidrs

  security_group_id = aws_security_group.ecs_host.id
  description       = "HTTPS from an approved API client network"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "ecs_https" {
  security_group_id = aws_security_group.ecs_host.id
  description       = "HTTPS for AWS service endpoints and image pulls"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "ecs_postgres" {
  security_group_id            = aws_security_group.ecs_host.id
  referenced_security_group_id = aws_security_group.database.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_ingress_rule" "database_postgres" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.ecs_host.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_ssm_parameter" "database_username" {
  name           = "${local.database_path}/username"
  description    = "RDS PostgreSQL master username"
  type           = "String"
  tier           = "Standard"
  insecure_value = var.database_username
}

# The default AWS-managed aws/ssm key avoids a customer-managed key.
resource "aws_ssm_parameter" "database_password" {
  name             = "${local.database_path}/password"
  description      = "RDS PostgreSQL master password"
  type             = "SecureString"
  tier             = "Standard"
  value_wo         = ephemeral.random_password.database.result
  value_wo_version = var.database_password_version
}
