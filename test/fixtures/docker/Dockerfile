# Intentionally bad Dockerfile fixture for ghas-free-pack acceptance tests.
FROM ubuntu:latest

# DL3008 (no version pin), DL3015 (no --no-install-recommends), DL3009 (apt lists not cleaned)
RUN apt-get update && apt-get install -y curl wget

# DL3020-adjacent: fetching remote script and executing it
ADD https://example.com/install.sh /tmp/install.sh
RUN chmod +x /tmp/install.sh && /tmp/install.sh

# DL3002: last USER is root
USER root

CMD ["bash"]
