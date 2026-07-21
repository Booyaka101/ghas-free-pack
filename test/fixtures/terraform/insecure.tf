# Intentionally insecure Terraform fixture for ghas-free-pack acceptance tests.

resource "aws_security_group" "wide_open" {
  name        = "wide-open"
  description = "Security group with SSH open to the world"

  ingress {
    description = "SSH from the entire internet"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_s3_bucket" "logs" {
  bucket = "ghas-free-pack-fixture-logs"
  acl    = "public-read"
}
