terraform {
  required_version = ">= 1.11.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73.0"
    }
  }
}

provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = { Project = "greenstay", ManagedBy = "Terraform" }
  }
}

variable "aws_account_id" {
  description = "AWS account that owns the GreenStay deployment."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Supply a 12-digit AWS account ID."
  }
}

variable "existing_github_oidc_provider_arn" {
  description = "ARN of an existing GitHub OIDC provider managed outside this bootstrap."
  type        = string
  default     = ""
}
