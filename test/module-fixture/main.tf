# Calls a registry module whose downloaded copy (.terraform/modules/sg) opens
# SSH to the world. The finding should land on this module call, and the same
# file under vendor/ should not be scanned at all.
module "sg" {
  source  = "example/sg/aws"
  version = "1.0.0"
}
