FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Base packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpam0g-dev \
    git \
    ca-certificates \
    curl \
    gnupg \
    apt-transport-https \
    libnss-extrausers \
  && rm -rf /var/lib/apt/lists/*

# NodeJS 20
RUN mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/carta-controller

# Copy your *local* repo into the image
COPY . .

# If you use submodules, either have them checked out locally,
# or let the build fetch them (requires .git to be present in build context).
RUN git submodule update --init --recursive || true

# Install deps and install CLI
RUN npm ci --include=dev || npm install --include=dev
RUN npm install -g .

# Your config

ENTRYPOINT ["/usr/bin/carta-controller"]