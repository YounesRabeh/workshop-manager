FROM node:22.22.0-bookworm-slim

ARG PNPM_VERSION=11.4.0

ENV CI=true \
    STEAMCMD_CONTRACT_PROFILE=linux \
    STEAMCMD_CONTRACT_OUTPUT_DIR=/contract-output

WORKDIR /project

RUN dpkg --add-architecture i386 \
  && apt-get update \
  && apt-get install --no-install-recommends -y \
    ca-certificates \
    libc6:i386 \
    libgcc-s1:i386 \
    libstdc++6:i386 \
    tar \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD ["pnpm", "run", "test:steamcmd:contract"]
