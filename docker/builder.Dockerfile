FROM electronuserland/builder:wine@sha256:8bb6fa0f99a00a5b845521910508958ebbb682b59221f0aa4b82102c22174164

ARG NODE_VERSION=22.22.0
ARG PNPM_VERSION=10.32.1

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

USER root

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates curl xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN arch="$(dpkg --print-architecture)" \
  && case "$arch" in \
    amd64) node_arch='x64' ;; \
    arm64) node_arch='arm64' ;; \
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
  esac \
  && node_tarball="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${node_tarball}" -o "/tmp/${node_tarball}" \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/SHASUMS256.txt \
  && (cd /tmp && grep " ${node_tarball}$" SHASUMS256.txt | sha256sum -c -) \
  && tar -xJf "/tmp/${node_tarball}" -C /usr/local --strip-components=1 --no-same-owner \
  && rm -f "/tmp/${node_tarball}" /tmp/SHASUMS256.txt \
  && corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

RUN mkdir -p \
  /project \
  /project/node_modules \
  /pnpm/corepack \
  /pnpm/store \
  /home/builder \
  /home/builder/.cache/electron \
  /home/builder/.cache/electron-builder \
  && chmod -R 0777 /project /pnpm /home/builder

WORKDIR /project

ENV HOME=/home/builder
ENV PNPM_STORE_DIR=/pnpm/store
ENV COREPACK_HOME=/pnpm/corepack
ENV XDG_CACHE_HOME=/home/builder/.cache
ENV ELECTRON_CACHE=/home/builder/.cache/electron
ENV ELECTRON_BUILDER_CACHE=/home/builder/.cache/electron-builder
