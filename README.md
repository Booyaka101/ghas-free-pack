# 🛡️ ghas-free-pack

**Free security scanning for Shell/Bash, Dockerfiles, Terraform HCL and PHP — the exact file types GitHub put behind paid Advanced Security.**

On **July 14, 2026** GitHub [shipped AI security detections on pull requests](https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/) — but only *"for customers with GitHub Code Security (GitHub Advanced Security)"*. Per [GitHub's own announcement](https://github.blog/security/application-security/github-expands-application-security-coverage-with-ai-powered-detections/), the ecosystems newly covered are **Shell/Bash, Dockerfiles, Terraform configurations (HCL), and PHP** — none of which CodeQL's free tier analyzes.

`ghas-free-pack` closes that gap with battle-tested open-source scanners, zero cost, zero accounts:

| File type | Scanner | License |
|-----------|---------|---------|
| `*.sh`, `*.bash` | [ShellCheck](https://github.com/koalaman/shellcheck) (39k+ ⭐) | GPLv3 |
| `Dockerfile*` | [Hadolint](https://github.com/hadolint/hadolint) (12k+ ⭐) | GPL-3.0 |
| `*.tf` | [tfsec](https://github.com/aquasecurity/tfsec) | MIT |
| `*.php` | [PHPStan](https://github.com/phpstan/phpstan) | MIT |

One Docker action, one unified [SARIF 2.1.0](https://json.schemastore.org/sarif-2.1.0.json) report, one PR comment.

## What you get on every pull request

1. **A PR comment** with a Markdown summary table, grouped by tool, with 🔴/🟠/🔵 severity icons and links to each rule's documentation. Updated in place on new pushes — no comment spam.
2. **A job step summary** with the same table (works on push events too).
3. **A SARIF upload** to GitHub code scanning (`Security → Code scanning`) — works on public repos with `security-events: write`; on private repos without GHAS it degrades gracefully to the comment.
4. **A meaningful exit code** — the check fails on error-level findings (and optionally on warnings), so branch protection can block vulnerable PRs.

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
| `enable-tfsec` | `true` | Scan `.tf` files with tfsec |
| `enable-phpstan` | `false` | Scan `.php` files with PHPStan (opt-in: PHP projects usually want a tuned `phpstan.neon`; one in your repo root is respected) |
| `fail-on-warning` | `false` | Also fail the check on warning-level findings |
| `phpstan-level` | `5` | PHPStan strictness 0–9 when no `phpstan.neon` exists |
| `github-token` | `${{ github.token }}` | Token for the PR comment + SARIF upload |

`node_modules`, `vendor`, `.terraform` and `.git` are always skipped.

## How it works

A Docker container action (`ubuntu:22.04`) installs the four scanners at image build, then `entrypoint.sh`:

1. finds the relevant files and runs each enabled scanner with JSON output (`/tmp/sc.json`, `/tmp/hd.json`, `/tmp/tf.json`, `/tmp/php.json`);
2. `src/sarif.js` merges everything into one **SARIF 2.1.0** file (one run per tool, rule metadata with `helpUri` links, severities mapped to `error`/`warning`/`note`);
3. `src/comment.js` renders the Markdown summary, posts/updates the PR comment, writes the step summary, and attempts the code-scanning SARIF upload;
4. the exit code is computed from aggregate counts (`errors > 0` → fail; `fail-on-warning: 'true'` extends that to warnings).

## Local verification (no GitHub needed)

Requires Docker Desktop and Node:

```powershell
cd test
npm install          # ajv, for SARIF schema validation
.\run-local.ps1
```

This builds the image, runs it against `test/fixtures/` (deliberately vulnerable Shell/Dockerfile/Terraform/PHP files) with a **mocked GitHub API** (`test/mock-github.js`), then `test/assert.js` verifies the acceptance criteria: hadolint `DL3002`, shellcheck `SC2163`, a tfsec HIGH/CRITICAL open-ingress finding, SARIF that validates against the official 2.1.0 JSON schema, and a posted PR comment containing the summary table. Artifacts land in `test/out/`.

## License

MIT for this action's own code (see `LICENSE`). The scanners are installed at image build from their official channels and keep their own licenses.
