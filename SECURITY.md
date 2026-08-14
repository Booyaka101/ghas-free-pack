# Security Policy

## Supported versions

The latest major tag (`@v1`) is the only one that gets fixes. Pinning to a commit SHA is fine, but you will not receive them.

## Reporting a vulnerability

Please **don't** open a public issue for a security problem.

Use GitHub's [private vulnerability reporting](https://github.com/Booyaka101/ghas-free-pack/security/advisories/new) instead. Expect a first response within a week.

Please include what you found, how to reproduce it, and what an attacker gets out of it.

## What this touches

Runs open-source scanners over Shell, Dockerfile, HCL and PHP inside your own workflow. Results stay in your repo's Security tab.

- **It runs inside your workflow, on your runner.** Findings are uploaded as SARIF to your own repository's Security tab and go nowhere else.
- **It executes third-party scanners.** They are pinned; a compromised pinned scanner is in scope and worth reporting.

## Scope

In scope: anything that leaks a credential, reads data belonging to someone else, or lets untrusted input reach code execution.

Out of scope: findings that require an attacker to already control the machine it runs on.
