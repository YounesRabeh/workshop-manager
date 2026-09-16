FROM node:24.18.0-bookworm-slim

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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN package_manager="$(node -p 'require("./package.json").packageManager')" \
  && case "${package_manager}" in pnpm@*) pnpm_version="${package_manager#pnpm@}" ;; *) exit 1 ;; esac \
  && pnpm_version="${pnpm_version%%+*}" \
  && npm install --global "pnpm@${pnpm_version}" \
  && pnpm --version \
  && pnpm install --frozen-lockfile

COPY . .

CMD ["pnpm", "run", "test:steamcmd:contract"]
