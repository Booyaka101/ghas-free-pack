# PROGRESS — ghas-free-pack

## State: build phase — Docker image building, e2e verification pending

### Phase 0 (done — all verified 2026-07-21)
- Changelog https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/ EXISTS; requires paid "GitHub Code Security (GitHub Advanced Security)".
- Language list verified via GitHub's companion post https://github.blog/security/application-security/github-expands-application-security-coverage-with-ai-powered-detections/ — verbatim: "ecosystems newly supported through AI-powered detections, including Shell/Bash, Dockerfiles, Terraform configurations (HCL), and PHP". (The changelog itself doesn't enumerate them; the blog post does.)
- ShellCheck (39.7k⭐, GPLv3, apt, `-f json`), Hadolint (12.3k⭐, GPL-3, Linux binary, `-f json`, DL3002 exists), tfsec (v1.28.14 release with binaries), PHPStan (MIT, composer) — all free. Cost model: $0, no accounts. NOT BLOCKED.
- Note: brief's claim "`eval $INPUT` triggers SC2163" is imprecise — SC2163 is the `export $var` rule. Fixture includes BOTH `export $INPUT` (guarantees SC2163) and `eval $INPUT`.

### Files written (all complete)
- `action.yml` — Docker action, inputs per brief + `phpstan-level` extra.
- `Dockerfile` — ubuntu:22.04, apt shellcheck/nodejs/php-cli/composer, hadolint + tfsec latest release binaries, phpstan via composer global.
- `entrypoint.sh` — reads dashed INPUT_* via printenv, finds files (prunes .git/node_modules/vendor/.terraform), runs scanners → /tmp/{sc,hd,tf,php}.json, runs src/sarif.js + src/comment.js, exit code from /tmp/counts.json (errors→1; warnings→1 if fail-on-warning). `GFP_ARTIFACT_DIR` env exports artifacts for local tests. LF endings enforced.
- `src/sarif.js` — merges raw JSON → SARIF 2.1.0 (/tmp/results.sarif) + /tmp/counts.json. Node-12-safe.
- `src/comment.js` — markdown table w/ 🔴🟠🔵, posts/updates PR comment (marker `<!-- ghas-free-pack -->`), step summary, gzip+base64 SARIF upload to /code-scanning/sarifs; honors GITHUB_API_URL (mock-testable). Node-12-safe.
- `test/fixtures/{shell/insecure.sh,docker/Dockerfile,terraform/insecure.tf,php/vulnerable.php}` — trigger SC2163, DL3002, tfsec open-ingress, phpstan errors.
- `test/mock-github.js` (mock API on :8899), `test/event.json` (PR #1), `test/run-local.ps1` (build+run+assert), `test/assert.js` (all acceptance checks), `test/validate-sarif.js`, `test/sarif-schema-2.1.0.json` (from schemastore, draft-07; OASIS master URL is 404 now), test/package.json + ajv installed.
- `README.md`, `LICENSE` (MIT), `examples/workflow.yml`, `.dockerignore`, `.gitattributes`.

### Next steps (exact)
1. Wait for `docker build -t ghas-free-pack:local .` (background task) — watch for failures in apt/hadolint/tfsec/composer download steps.
2. `cd test; .\run-local.ps1` — iterate until `node assert.js` prints "all checks passed". Likely trouble spots: hadolint `--no-fail` flag name, tfsec output when scanning from `.`, phpstan needing `--level` syntax, host.docker.internal reachability, /artifacts permissions.
3. Re-verify SARIF with `node test\validate-sarif.js`.
4. `git init`, commit everything (git identity may need setting).
5. Update this file + finish summary. Do NOT publish anywhere (rules).

### Verified working
- (pending e2e run)
