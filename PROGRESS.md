# PROGRESS — ghas-free-pack

## State: COMPLETE — built, verified end-to-end locally, committed (git main @ cc7168d)

### Phase 0 (verified 2026-07-21)
- Changelog https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/ EXISTS; requires paid "GitHub Code Security (GitHub Advanced Security)".
- Language list confirmed in GitHub's companion post https://github.blog/security/application-security/github-expands-application-security-coverage-with-ai-powered-detections/ — verbatim: "ecosystems newly supported through AI-powered detections, including Shell/Bash, Dockerfiles, Terraform configurations (HCL), and PHP". (The changelog itself doesn't enumerate them; the blog post does.)
- ShellCheck / Hadolint / tfsec / PHPStan all free & alive. Cost model $0. NOT BLOCKED.
- Brief nit: "`eval $INPUT` triggers SC2163" is imprecise — SC2163 is the `export $var` rule. Fixture has BOTH lines; SC2163 fires from `export $INPUT` (shellcheck classifies it warning-level, shown 🟠 in the comment).

### VERIFIED WORKING (local e2e, real scanners, 2026-07-21)
`test\run-local.ps1` → docker build + run against `test/fixtures` with mocked GitHub API → `test/assert.js`: **all 17 checks PASS**:
- shellcheck 8 findings incl. SC2163 ✅ (acceptance 2)
- hadolint 5 findings incl. DL3002 "Last USER should not be root" ✅ (acceptance 1)
- tfsec 11 findings incl. aws-ec2-no-public-ingress-sgr = CRITICAL on 0.0.0.0/0 ingress ✅ (acceptance 3)
- phpstan 4 file_errors (argument.type ×2, variable.undefined, function.notFound) ✅
- /tmp/results.sarif: 4 runs, validates against SARIF 2.1.0 schema (ajv, draft-07, schemastore copy) ✅ (acceptance 4)
- PR comment POSTed with grouped markdown tables + 🔴🟠🔵 + rule links ✅ (acceptance 5); second run PATCHes comment 1001 in place (verified manually, stateful mock)
- SARIF upload POST /code-scanning/sarifs with commit_sha/ref/gzip+base64 payload ✅
- step summary written; exit code 1 on error findings ✅

### Gotchas already solved (don't re-hit)
- Ubuntu 22.04 composer 2.2 global home is `/root/.composer` (not `/root/.config/composer`) — PATH covers both.
- OASIS sarif-spec `master/Schemata/...` raw URL is 404; schema fetched from json.schemastore.org/sarif-2.1.0.json (draft-07, ajv 8 OK with validateFormats:false).
- entrypoint.sh & fixtures must be LF (enforced + .gitattributes).
- Dashed action inputs (INPUT_ENABLE-SHELLCHECK) unreadable as bash vars — read via `printenv`.
- hadolint needs `--no-fail`; tfsec needs `--soft-fail`; neither may abort the run.

### Next steps (only external/publish steps remain — need owner)
1. Create public GitHub repo `ghas-free-pack`, push main, tag v1 (+ moving major tag), release.
2. Tick "Publish this Action to the GitHub Actions Marketplace", category Security. `action.yml` branding (shield/green) already set. Replace `YOUR_GITHUB_USER` in README/examples with the real org/user.
3. Optional smoke test on a real public repo PR before announcing (rules forbade external publishing during the autonomous build).
4. Launch angle in README ("Distribution").
