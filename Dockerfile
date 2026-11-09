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
# Keep the existing SHA256 argument for AMD64 builds.
ARG HADOLINT_SHA256=c7187db94eeeeca956519a6af171adc31453941a1e777961f6e680f697c8c507
ARG HADOLINT_ARM64_SHA256=f6198ef8090f404dbb771abfee086eb8c48ac177f30da7fd3510aca35b344b5d
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
        amd64) asset=x86_64; checksum="${HADOLINT_SHA256}" ;; \
        arm64) asset=arm64; checksum="${HADOLINT_ARM64_SHA256}" ;; \
        *) echo "Unsupported target architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL -o /usr/local/bin/hadolint \
        "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-linux-${asset}" \
    && echo "${checksum}  /usr/local/bin/hadolint" | sha256sum -c - \
    && chmod +x /usr/local/bin/hadolint

ARG PHPSTAN_VERSION=2.3.5
ARG PHPSTAN_SHA256=4b3ed7850a20b092331bd1040e4f54a1d3c0559b4cf006431073997ebcb4324b
RUN curl -fsSL -o /usr/local/bin/phpstan \
        "https://github.com/phpstan/phpstan/releases/download/${PHPSTAN_VERSION}/phpstan.phar" \
    && echo "${PHPSTAN_SHA256}  /usr/local/bin/phpstan" | sha256sum -c - \
    && chmod +x /usr/local/bin/phpstan

ARG TRIVY_VERSION=0.76.2
ARG TRIVY_SHA256=bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf
ARG TRIVY_ARM64_SHA256=ab9d51f86e6a5fb936f605faff6b593ac51bc378fff4d3e8b9d58358b9c367c3
RUN case "${TARGETARCH}" in \
        amd64) asset=64bit; checksum="${TRIVY_SHA256}" ;; \
        arm64) asset=ARM64; checksum="${TRIVY_ARM64_SHA256}" ;; \
        *) echo "Unsupported target architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL -o /tmp/trivy.tar.gz \
        "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${asset}.tar.gz" \
    && echo "${checksum}  /tmp/trivy.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
    && rm /tmp/trivy.tar.gz

# Trivy's misconfiguration checks ship as a separate OCI bundle that it would
# otherwise pull from the floating :2 tag on every run. Bake trivy-checks 2.3.0
# in by digest so scans are reproducible and need no network. A bad digest makes
# Trivy fall back to its embedded checks with exit 0, hence the explicit check.
# GitHub runs actions with HOME=/github/home, so the cache cannot live under ~.
ARG TRIVY_CHECKS_DIGEST=sha256:2a540ca498daa278b14a77e8e5cd02594d16d131e5032afa65c279d0005826f2
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
