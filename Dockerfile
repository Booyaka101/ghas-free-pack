FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# shellcheck via apt; node for the SARIF/comment scripts; php for PHPStan;
# git for Trivy to fetch git:: Terraform module sources
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        shellcheck \
        nodejs \
        php-cli \
        php-mbstring \
        php-xml \
    && rm -rf /var/lib/apt/lists/*

# Every downloaded scanner is pinned to a version and a sha256 committed here.
# The digests are not fetched from the release at build time: a checksums file
# published next to a tampered release would vouch for the tampered binary.
# Trivy's digest comes from trivy_<v>_checksums.txt (Sigstore-signed by Aqua's
# release workflow), hadolint's from its checksums.sha256, PHPStan's from its
# GPG-signed release (PHPStan Bot, CA7C2C7A30C8E8E1274A847651C67305FFC2E5C0).

ARG HADOLINT_VERSION=2.15.1
ARG HADOLINT_SHA256=c7187db94eeeeca956519a6af171adc31453941a1e777961f6e680f697c8c507
RUN curl -fsSL -o /usr/local/bin/hadolint \
        "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-linux-x86_64" \
    && echo "${HADOLINT_SHA256}  /usr/local/bin/hadolint" | sha256sum -c - \
    && chmod +x /usr/local/bin/hadolint

ARG PHPSTAN_VERSION=2.2.16
ARG PHPSTAN_SHA256=1a2fb5460c142502d3cd06272529c18b19fda004ada974bd2581cb9fd6c0a53b
RUN curl -fsSL -o /usr/local/bin/phpstan \
        "https://github.com/phpstan/phpstan/releases/download/${PHPSTAN_VERSION}/phpstan.phar" \
    && echo "${PHPSTAN_SHA256}  /usr/local/bin/phpstan" | sha256sum -c - \
    && chmod +x /usr/local/bin/phpstan

ARG TRIVY_VERSION=0.74.0
ARG TRIVY_SHA256=2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a
RUN curl -fsSL -o /tmp/trivy.tar.gz \
        "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
    && echo "${TRIVY_SHA256}  /tmp/trivy.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
    && rm /tmp/trivy.tar.gz

# Trivy's misconfiguration checks ship as a separate OCI bundle that it would
# otherwise pull from the floating :2 tag on every run. Bake trivy-checks 2.2.0
# in by digest so scans are reproducible and need no network. A bad digest makes
# Trivy fall back to its embedded checks with exit 0, hence the explicit check.
# GitHub runs actions with HOME=/github/home, so the cache cannot live under ~.
ARG TRIVY_CHECKS_DIGEST=sha256:b4a7e239039f2ed756c2e88f2d2f95f80658aed99545e637db3ce6133051fb87
ENV TRIVY_CACHE_DIR=/opt/trivy-cache
RUN mkdir /tmp/empty \
    && trivy config --quiet --disable-telemetry --skip-version-check \
        --checks-bundle-repository "mirror.gcr.io/aquasec/trivy-checks@${TRIVY_CHECKS_DIGEST}" /tmp/empty \
    && rmdir /tmp/empty \
    && if ! grep -q "\"Digest\":\"${TRIVY_CHECKS_DIGEST}\"" "${TRIVY_CACHE_DIR}/policy/metadata.json"; then \
        echo "trivy-checks bundle ${TRIVY_CHECKS_DIGEST} was not installed" >&2; exit 1; \
    fi

COPY entrypoint.sh /action/entrypoint.sh
COPY src/ /action/src/
RUN chmod +x /action/entrypoint.sh

ENTRYPOINT ["/action/entrypoint.sh"]
