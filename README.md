# 🛡️ ghas-free-pack

**Free security scanning for Shell/Bash, Dockerfiles, Terraform HCL and PHP, the file types GitHub put behind paid Advanced Security.**

On **July 14, 2026** GitHub [shipped AI security detections on pull requests](https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/), but only *"for customers with GitHub Code Security (GitHub Advanced Security)"*. Per [GitHub's own announcement](https://github.blog/security/application-security/github-expands-application-security-coverage-with-ai-powered-detections/), the newly covered ecosystems are **Shell/Bash, Dockerfiles, Terraform configurations (HCL), and PHP**. CodeQL's free tier analyzes none of them.

`ghas-free-pack` covers the same file types with established open-source scanners. No cost, no accounts:

| File type | Scanner | License |
|-----------|---------|---------|
| `*.sh`, `*.bash` | [ShellCheck](https://github.com/koalaman/shellcheck) | GPL-3.0 |
| `Dockerfile*` | [Hadolint](https://github.com/hadolint/hadolint) | GPL-3.0 |
| `*.tf` | [Trivy](https://github.com/aquasecurity/trivy) (`trivy config`) | Apache-2.0 |
| `*.php` | [PHPStan](https://github.com/phpstan/phpstan) | MIT |

One Docker action, one [SARIF 2.1.0](https://json.schemastore.org/sarif-2.1.0.json) report, one PR comment.

tfsec was replaced by Trivy in 1.1.0. Existing workflows keep working, see [CHANGELOG.md](CHANGELOG.md).

## What you get on every pull request

1. **A PR comment** with a summary table grouped by tool, 🔴/🟠/🔵 severity icons and links to each rule's documentation. It is edited in place on later pushes, so there is one comment per PR.
2. **A job step summary** with the same table. This works on push events too.
3. **A SARIF upload** to GitHub code scanning (`Security → Code scanning`). Public repos need `security-events: write`. Private repos without GHAS can't receive the upload, so they get the comment and the summary only.
4. **A meaningful exit code.** The check fails on error-level findings (optionally on warnings too), so branch protection can block a vulnerable PR.

## Usage

```yaml
# .github/workflows/security.yml
name: Security scan (free)
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write     # PR summary comment
  security-events: write   # SARIF upload (public repos)

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: Booyaka101/ghas-free-pack@v1
        with:
          github-token: ${{ github.token }}
```

### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `enable-shellcheck` | `true` | Scan `.sh` / `.bash` files with ShellCheck |
| `enable-hadolint` | `true` | Scan `Dockerfile*` with Hadolint |
| `enable-trivy` | `true` | Scan `.tf` files with Trivy |
| `enable-tfsec` | | Deprecated alias for `enable-trivy`. Still honored, with a warning in the log |
| `enable-phpstan` | `false` | Scan `.php` files with PHPStan. Opt-in, because PHP projects usually want a tuned `phpstan.neon`; one in your repo root is respected |
| `fail-on-warning` | `false` | Also fail the check on warning-level findings |
| `phpstan-level` | `5` | PHPStan strictness 0-9 when no `phpstan.neon` exists |
| `github-token` | `${{ github.token }}` | Token for the PR comment and SARIF upload |

`node_modules`, `vendor`, `.terraform` and `.git` are skipped when looking for files. Trivy still follows your `module` blocks into `.terraform/modules` if you ran `terraform init` earlier in the job, and a finding inside a downloaded module is reported on the innermost `module` call in your own code, with the module file and line in the message. Remote modules that aren't in `.terraform/modules` are downloaded during the scan, as tfsec did.

## Pinned scanners

Trivy, Hadolint and PHPStan are pinned to a version and checked against a committed SHA-256 at image build. A mismatch fails the build. ShellCheck comes from Ubuntu's signed apt archive.

| Scanner | Version | Source |
|---------|---------|--------|
| Trivy | 0.75.0 | GitHub release tarball, digest from the Sigstore-signed `checksums.txt` |
| Trivy checks | 2.2.0 | `mirror.gcr.io/aquasec/trivy-checks`, pinned by OCI digest and baked into the image |
| Hadolint | 2.15.1 | GitHub release binary, digest from the release's `checksums.sha256` |
| PHPStan | 2.2.17 | GitHub release `phpstan.phar`, GPG signature checked when the pin was set |
| ShellCheck | 0.11.0 | Ubuntu 26.04 apt archive (signed by Ubuntu), not pinned |

The scanners and Trivy's checks are baked into the image, so the rule set only changes when this action ships a release. An upstream checks update, good or bad, can't reach your pipeline between releases.

Dependabot can't bump Dockerfile ARGs, so a weekly workflow (`.github/workflows/pin-freshness.yml`) goes red when upstream has a newer release than a pin.

## How it works

The action is a Docker container (`ubuntu:26.04`) with the scanners installed at image build. At run time `entrypoint.sh`:

1. finds the relevant files and runs each enabled scanner with JSON output (`/tmp/sc.json`, `/tmp/hd.json`, `/tmp/tv.json`, `/tmp/php.json`);
2. `src/sarif.js` merges them into one SARIF 2.1.0 file, one run per tool, with `helpUri` rule links and severities mapped to `error`/`warning`/`note` (Trivy CRITICAL and HIGH are errors, MEDIUM is a warning, LOW is a note). Each result gets the same `primaryLocationLineHash` fingerprint `upload-sarif` would add, so alerts track their code across commits instead of duplicating;
3. `src/comment.js` renders the summary, posts or updates the PR comment, writes the step summary and uploads the SARIF to code scanning;
4. the exit code comes from the totals: any error fails the step, and `fail-on-warning: 'true'` extends that to warnings.

## Limitations

- The image is x86_64 only. It won't run on arm64 runners.
- Trivy only scans Terraform here. Hadolint already covers Dockerfiles, and Kubernetes, CloudFormation and Helm are not wired up.
- PHPStan finds type and logic errors. It is not a PHP security taint analyzer.

## Local verification (no GitHub needed)

Requires Docker Desktop and Node:

```powershell
cd test
npm install          # ajv, for SARIF schema validation
.\run-local.ps1
```

This builds the image and runs it against `test/fixtures/` (deliberately vulnerable Shell, Dockerfile, Terraform and PHP files) with a mocked GitHub API (`test/mock-github.js`). Then:

- `assert.js` checks the acceptance criteria: Hadolint `DL3002`, ShellCheck `SC2163`, the open SSH ingress flagged by Trivy as `AWS-0107` at HIGH and reported as an error, Trivy's findings matching the recording in `test/fixtures/trivy.json`, fingerprints matching codeql-action's, and a posted PR comment with the summary table;
- `validate-sarif.js` validates the SARIF against the official 2.1.0 JSON schema;
- `image-checks.js` runs the image offline with `HOME=/github/home` as GitHub does, and checks the `enable-tfsec` alias, that the baked checks bundle is used, the module-call reporting (`test/module-fixture/`) and that `vendor/` is skipped;
- `tamper-check.js` rebuilds the image with each pinned digest replaced by zeros and expects every build to fail.

Artifacts land in `test/out/`. CI runs the same steps on every pull request.

## License

MIT for this action's own code (see `LICENSE`). The scanners keep their own licenses.
