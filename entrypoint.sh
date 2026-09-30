#!/bin/bash
# ghas-free-pack — free security scanning for the file types GitHub gated
# behind Advanced Security (Shell/Bash, Dockerfiles, Terraform HCL, PHP).
# Deliberately NOT `set -e`: the scanners exit non-zero when they find issues;
# we aggregate findings and decide the exit code ourselves at the end.
set -uo pipefail

# Action inputs arrive as INPUT_<NAME> env vars with dashes preserved
# (e.g. INPUT_ENABLE-SHELLCHECK), which bash cannot reference directly.
input() {
    printenv "INPUT_$1" 2>/dev/null || true
}

ENABLE_SHELLCHECK="$(input 'ENABLE-SHELLCHECK')"
ENABLE_HADOLINT="$(input 'ENABLE-HADOLINT')"
ENABLE_TRIVY="$(input 'ENABLE-TRIVY')"
ENABLE_TFSEC="$(input 'ENABLE-TFSEC')"
ENABLE_PHPSTAN="$(input 'ENABLE-PHPSTAN')"
FAIL_ON_WARNING="$(input 'FAIL-ON-WARNING')"
PHPSTAN_LEVEL="$(input 'PHPSTAN-LEVEL')"

: "${ENABLE_SHELLCHECK:=true}"
: "${ENABLE_HADOLINT:=true}"
: "${ENABLE_TRIVY:=true}"
: "${ENABLE_PHPSTAN:=false}"
: "${FAIL_ON_WARNING:=false}"
: "${PHPSTAN_LEVEL:=5}"

# enable-tfsec now controls the Trivy step. The 1.0.x action.yml also pulls the
# floating :v1 image, has no enable-trivy input and always sends enable-tfsec
# (default 'true'), so only warn when enable-trivy is present, i.e. the workflow
# really does use the 1.1+ inputs.
if [ -n "$ENABLE_TFSEC" ]; then
    if printenv 'INPUT_ENABLE-TRIVY' >/dev/null; then
        echo "::warning::enable-tfsec is deprecated: tfsec was replaced by Trivy in ghas-free-pack 1.1.0. Rename the input to enable-trivy."
    fi
    [ "$ENABLE_TRIVY" = "true" ] && ENABLE_TRIVY="$ENABLE_TFSEC"
fi

WORKSPACE="${GITHUB_WORKSPACE:-$(pwd)}"
cd "$WORKSPACE" || { echo "::error::Cannot cd to workspace $WORKSPACE"; exit 2; }

rm -f /tmp/sc.json /tmp/hd.json /tmp/tv.json /tmp/php.json /tmp/results.sarif /tmp/counts.json

# Prune vendored/generated trees so we only scan the repo's own code.
PRUNE=( -path './.git' -o -path '*/node_modules' -o -path '*/vendor' -o -path '*/.terraform' )

echo "ghas-free-pack: scanning $WORKSPACE"

# ---------------------------------------------------------------- shellcheck
if [ "$ENABLE_SHELLCHECK" = "true" ]; then
    mapfile -d '' SH_FILES < <(find . \( "${PRUNE[@]}" \) -prune -o -type f \( -name '*.sh' -o -name '*.bash' \) -print0)
    if [ "${#SH_FILES[@]}" -gt 0 ]; then
        echo "shellcheck: ${#SH_FILES[@]} file(s)"
        shellcheck -f json "${SH_FILES[@]}" >> /tmp/sc.json 2>/dev/null
    else
        echo "shellcheck: no .sh/.bash files found"
    fi
fi

# ------------------------------------------------------------------ hadolint
if [ "$ENABLE_HADOLINT" = "true" ]; then
    mapfile -d '' DOCKER_FILES < <(find . \( "${PRUNE[@]}" \) -prune -o -type f \( -name 'Dockerfile' -o -name 'Dockerfile.*' -o -name '*.Dockerfile' -o -name '*.dockerfile' \) -print0)
    if [ "${#DOCKER_FILES[@]}" -gt 0 ]; then
        echo "hadolint: ${#DOCKER_FILES[@]} file(s)"
        hadolint -f json --no-fail "${DOCKER_FILES[@]}" >> /tmp/hd.json 2>/dev/null
    else
        echo "hadolint: no Dockerfiles found"
    fi
fi

# --------------------------------------------------------------------- trivy
# Terraform only: hadolint already covers Dockerfiles. The checks bundle is baked
# into the image (TRIVY_CACHE_DIR), so nothing is fetched at run time.
# .terraform is not skipped: Trivy reads downloaded modules from it.
if [ "$ENABLE_TRIVY" = "true" ]; then
    mapfile -d '' TF_FILES < <(find . \( "${PRUNE[@]}" \) -prune -o -type f -name '*.tf' -print0)
    if [ "${#TF_FILES[@]}" -gt 0 ]; then
        echo "trivy: ${#TF_FILES[@]} file(s)"
        trivy config . --misconfig-scanners terraform \
            --skip-dirs '**/node_modules' --skip-dirs '**/vendor' \
            --skip-check-update --skip-version-check --disable-telemetry \
            --format json --output /tmp/tv.json --exit-code 0 \
            || echo "::warning::trivy config failed, Terraform results are missing"
    else
        echo "trivy: no .tf files found"
    fi
fi

# ------------------------------------------------------------------- phpstan
if [ "$ENABLE_PHPSTAN" = "true" ]; then
    mapfile -d '' PHP_FILES < <(find . \( "${PRUNE[@]}" \) -prune -o -type f -name '*.php' -print0)
    if [ "${#PHP_FILES[@]}" -gt 0 ]; then
        echo "phpstan: ${#PHP_FILES[@]} file(s)"
        PHPSTAN_ARGS=( analyse --no-progress --error-format=json )
        # Respect a repo-provided config; otherwise scan discovered files at the chosen level.
        if [ -f phpstan.neon ] || [ -f phpstan.neon.dist ] || [ -f phpstan.dist.neon ]; then
            phpstan "${PHPSTAN_ARGS[@]}" >> /tmp/php.json 2>/dev/null
        else
            phpstan "${PHPSTAN_ARGS[@]}" --level="$PHPSTAN_LEVEL" "${PHP_FILES[@]}" >> /tmp/php.json 2>/dev/null
        fi
    else
        echo "phpstan: no .php files found"
    fi
fi

# ------------------------------------------- aggregate, report, decide exit
node /action/src/sarif.js || { echo "::error::SARIF generation failed"; exit 2; }
node /action/src/comment.js || echo "::warning::PR comment / SARIF upload step had errors (see log above)"

# Local-test hook: export raw + aggregated results to a mounted directory.
if [ -n "${GFP_ARTIFACT_DIR:-}" ]; then
    mkdir -p "$GFP_ARTIFACT_DIR"
    cp /tmp/sc.json /tmp/hd.json /tmp/tv.json /tmp/php.json /tmp/results.sarif /tmp/counts.json "$GFP_ARTIFACT_DIR/" 2>/dev/null
fi

ERRORS=0
WARNINGS=0
if [ -f /tmp/counts.json ]; then
    ERRORS=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/counts.json','utf8')).errors")
    WARNINGS=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/counts.json','utf8')).warnings")
fi

echo "ghas-free-pack: ${ERRORS} error(s), ${WARNINGS} warning(s)"

if [ "$ERRORS" -gt 0 ]; then
    echo "::error::ghas-free-pack found ${ERRORS} error-level finding(s)"
    exit 1
fi
if [ "$FAIL_ON_WARNING" = "true" ] && [ "$WARNINGS" -gt 0 ]; then
    echo "::error::ghas-free-pack found ${WARNINGS} warning(s) and fail-on-warning is enabled"
    exit 1
fi
exit 0
