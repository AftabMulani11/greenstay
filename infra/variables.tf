variable "project_name" {
  description = "Name used to prefix AWS resources and the database parameter path."
  type        = string
  default     = "greenstay"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,22}[a-z0-9]$", var.project_name)) && !strcontains(var.project_name, "--")
    error_message = "Use 3 to 24 lowercase letters, digits, or hyphens. Start with a letter, end with a letter or digit, and avoid consecutive hyphens."
  }
}

variable "api_https_ingress_cidrs" {
  description = "IPv4 CIDRs allowed to reach HTTPS on ECS hosts. Leave empty until the API ingress is configured."
  type        = set(string)
  default     = []

  validation {
    condition = alltrue([
      for cidr in var.api_https_ingress_cidrs :
      can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) > 0, false)
    ])
    error_message = "Supply IPv4 CIDRs narrower than /0."
  }
}

variable "database_username" {
  description = "Master username for the future RDS PostgreSQL instance."
  type        = string
  default     = "greenstay_admin"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,15}$", var.database_username))
    error_message = "Use 1 to 16 lowercase letters, digits, or underscores, starting with a letter."
  }
}

variable "database_password_version" {
  description = "Increment to rotate the SSM and RDS password in one apply."
  type        = number
  default     = 1

  validation {
    condition     = var.database_password_version >= 1 && floor(var.database_password_version) == var.database_password_version
    error_message = "The password version must be a positive integer."
  }
}

variable "ses_sender_email" {
  description = "Email address to verify in SES and use as the Lambda sender."
  type        = string

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.ses_sender_email))
    error_message = "Supply a single email address without surrounding whitespace."
  }
}

variable "backend_image_digest" {
  description = "Digest of the published backend image."
  type        = string
  default     = null

  validation {
    condition     = var.backend_image_digest == null || can(regex("^sha256:[a-f0-9]{64}$", var.backend_image_digest))
    error_message = "Supply a SHA-256 ECR image digest."
  }
}

variable "frontend_release" {
  description = "Release directory for the published React build."
  type        = string
  default     = null

  validation {
    condition     = var.frontend_release == null || can(regex("^[a-z0-9][a-z0-9-]{0,63}$", var.frontend_release))
    error_message = "Use lowercase letters, digits, or hyphens for the frontend release."
  }
}

variable "alarm_email" {
  description = "Optional email address for CloudWatch alarm notifications."
  type        = string
  default     = null

  validation {
    condition     = var.alarm_email == null || can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.alarm_email))
    error_message = "Supply a single email address or leave notifications unconfigured."
  }
}

variable "aws_account_id" {
  description = "AWS account that owns this deployment."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Supply a 12-digit AWS account ID."
  }
}

variable "workload_permissions_boundary_arn" {
  description = "Permissions boundary applied to GreenStay's runtime roles by CI."
  type        = string
  default     = null
}
