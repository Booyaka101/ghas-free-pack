# ghas-free-pack — Launch Material

Tone follows the cargo-witness precedent: factual and technical, limitations stated
up front rather than buried. The audience for security tooling is rightly skeptical
of hype, so every claim here is one the action actually backs up.

---

## dev.to article

**Title:** GitHub put Shell, Dockerfiles, Terraform and PHP behind a paywall. Here's a free Action that scans them.

**Tags:** security, github, devops, opensource

**Body:**

On [July 14, 2026](https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/) GitHub shipped AI security detections on pull requests. The changelog is one sentence long, and the important part is the qualifier: the feature is available *"for customers with GitHub Code Security (GitHub Advanced Security)"*.

The changelog doesn't say which ecosystems it covers. The [companion post](https://github.blog/security/application-security/github-expands-application-security-coverage-with-ai-powered-detections/) does, verbatim:

> ecosystems newly supported through AI-powered detections, including **Shell/Bash, Dockerfiles, Terraform configurations (HCL), and PHP**

Those four have something in common: **CodeQL's free tier doesn't analyze any of them.** CodeQL covers C/C++, C#, Go, Java/Kotlin, JavaScript/TypeScript, Python, Ruby, Rust and Swift. If your repo is a pile of deploy scripts, a Dockerfile and some Terraform — which describes a lot of infrastructure repos — free code scanning has been giving you nothing, and the thing that would cover you is now a paid SKU.

The scanners for those four ecosystems already exist, are mature, and are free. What was missing is the part GHAS actually sells: unified reporting, SARIF in the Security tab, and a PR comment that tells you what changed. So I wired it up.

## What it is

```yaml
- uses: Booyaka101/ghas-free-pack@v1
  with:
    github-token: ${{ github.token }}
```

That runs **ShellCheck** over `.sh`/`.bash`, **Hadolint** over `Dockerfile*`, **tfsec** over `.tf`, and **PHPStan** over `.php` — then merges every finding into one SARIF 2.1.0 document, uploads it to code scanning, and posts a grouped PR comment with rule links.

Findings land in the Security tab exactly like CodeQL's do, because SARIF is SARIF.

## What it actually catches

From the fixtures in the repo's own test suite, all real findings from the real scanners:

- `SC2163` — `export $INPUT` exports the *name*, not the value. A classic silent shell bug.
- `DL3002` — last `USER` is root. Your container runs privileged.
- `aws-ec2-no-public-ingress-sgr` — **CRITICAL** — a security group with `0.0.0.0/0` ingress.
- PHPStan level 5 argument-type and undefined-variable errors.

## Honest limitations

- **These are the established open-source scanners, not GitHub's AI detections.** Different technique, overlapping coverage. This does not reproduce whatever the LLM-based analysis finds; it gives you the deterministic rule-based coverage that free CodeQL never offered for these file types.
- **PHPStan is opt-in** (`enable-phpstan: true`). Most PHP projects need a tuned `phpstan.neon`, and turning it on by default would bury you in noise on day one.
- **It's a Docker action**, so it's Linux runners only, and the first run pays an image build.
- **SARIF upload needs `security-events: write`** and the PR comment needs `pull-requests: write`. Without those it still runs and still writes a job summary, it just can't publish. Grant them explicitly:

```yaml
permissions:
  contents: read
  security-events: write
  pull-requests: write
```

## Verification

I don't expect anyone to take a security tool's word for it, so the repo ships the harness I used: `test/run-local.ps1` builds the image, runs it against `test/fixtures` with a mocked GitHub API, and asserts 17 acceptance criteria — including that the merged SARIF validates against the SARIF 2.1.0 schema with ajv, that the PR comment contains the expected rules, and that a re-run PATCHes the existing comment in place instead of posting a second one.

One thing that cost me time and is worth writing down: the OASIS `sarif-spec` raw URL for the 2.1.0 schema (`master/Schemata/sarif-schema-2.1.0.json`) is **404** — the repo was restructured. The working copy is `https://json.schemastore.org/sarif-2.1.0.json`, which declares draft-07 and validates fine with ajv 8 given `strict: false`.

MIT. Repo: https://github.com/Booyaka101/ghas-free-pack

---

## X post

Single paragraph, plain ASCII — the composer mangles blank lines and emoji.

> GitHub's July 14 AI security detections cover Shell/Bash, Dockerfiles, Terraform and PHP - but only for paid Advanced Security customers. Those are exactly the four ecosystems free CodeQL has never analyzed. So I shipped ghas-free-pack: a GitHub Action that runs ShellCheck, Hadolint, tfsec and PHPStan, merges them into one SARIF 2.1.0 upload so findings land in your Security tab, and posts a grouped PR comment. MIT, free, one YAML block. https://github.com/Booyaka101/ghas-free-pack
