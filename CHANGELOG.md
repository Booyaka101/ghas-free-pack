# Changelog

## 1.1.0

tfsec is replaced by Trivy, and every scanner in the image is now pinned and checksum-verified.

### Changed

- Terraform is scanned by `trivy config` (Trivy 0.74.0) instead of tfsec. tfsec has been merged into Trivy upstream and gets no new checks.
- New input `enable-trivy` (default `true`). `enable-tfsec` still works as an alias and prints a deprecation warning. Setting either one to `'false'` turns Trivy off.
- Trivy, Hadolint 2.15.1 and PHPStan 2.2.16 are downloaded at a fixed version and checked against a committed SHA-256 during the image build. Before this, tfsec and Hadolint came from `latest` and PHPStan from an unpinned Composer install.
- The Trivy checks bundle (trivy-checks 2.2.0) is pinned by digest and baked into the image. Scans make no network calls, and results only change when this action is released.
- The base image is `ubuntu:26.04` (Node 22, PHP 8.5). Composer, git and unzip are no longer in the image.

### Fixed

- A finding inside a downloaded Terraform module (`.terraform/modules/...`) is reported on the `module` block in your code. The module file and line are in the message.
- Trivy skips `node_modules` and `vendor`, matching the other scanners.

### Upgrading

Nothing to change in your workflow. Two things to expect in code scanning:

- Terraform alerts now come from a tool named `Trivy` with IDs like `AWS-0107`, where tfsec used `AVD-AWS-0107`. Some severities and checks differ too. On this repo's test fixture tfsec rated the open SSH ingress CRITICAL and Trivy rates it HIGH (both fail the check), and tfsec's `AVD-AWS-0088` (unencrypted S3 bucket) has no Trivy counterpart.
- GitHub may keep showing the old tfsec alerts after the first 1.1.0 run. Check `Security → Code scanning`, filter by tool `tfsec`, and dismiss what's left.

Renaming `enable-tfsec` to `enable-trivy` in your workflow silences the warning.

Workflows pinned to `v1.0.1` also move to Trivy, because that release pulls the `:v1` image. They keep working, `enable-tfsec` still applies, and they don't get the deprecation warning. `v1.0.0` builds its own image and is unaffected.

## 1.0.1

- The action pulls a prebuilt image from GHCR instead of building it on every run.

## 1.0.0

- First release: ShellCheck, Hadolint, tfsec and PHPStan merged into one SARIF upload and one PR comment.
