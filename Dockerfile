FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1

# shellcheck via apt; node for the SARIF/comment scripts; php+composer for PHPStan
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        shellcheck \
        nodejs \
        php-cli \
        php-mbstring \
        php-xml \
        composer \
        unzip \
        git \
    && rm -rf /var/lib/apt/lists/*

# hadolint: static binary from latest GitHub release
RUN curl -fsSL -o /usr/local/bin/hadolint \
        https://github.com/hadolint/hadolint/releases/latest/download/hadolint-Linux-x86_64 \
    && chmod +x /usr/local/bin/hadolint

# tfsec: static binary from latest GitHub release
RUN curl -fsSL -o /usr/local/bin/tfsec \
        https://github.com/aquasecurity/tfsec/releases/latest/download/tfsec-linux-amd64 \
    && chmod +x /usr/local/bin/tfsec

# phpstan via composer global (per PHPStan's recommended install)
RUN composer global require phpstan/phpstan --no-interaction --no-progress
# Ubuntu 22.04's composer 2.2 uses ~/.composer as global home; newer composers
# use ~/.config/composer — cover both.
ENV PATH="/root/.composer/vendor/bin:/root/.config/composer/vendor/bin:${PATH}"

COPY entrypoint.sh /action/entrypoint.sh
COPY src/ /action/src/
RUN chmod +x /action/entrypoint.sh

ENTRYPOINT ["/action/entrypoint.sh"]
