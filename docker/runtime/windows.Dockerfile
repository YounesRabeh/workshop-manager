# escape=`
FROM mcr.microsoft.com/windows/servercore:ltsc2022

ARG NODE_VERSION=22.22.0
ARG PNPM_VERSION=11.4.0

ENV NODE_VERSION=${NODE_VERSION}

SHELL ["powershell", "-NoLogo", "-NoProfile", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

RUN $archiveName = "node-v$env:NODE_VERSION-win-x64.zip"; `
    $archivePath = "C:\$archiveName"; `
    Invoke-WebRequest "https://nodejs.org/dist/v$env:NODE_VERSION/$archiveName" -OutFile $archivePath; `
    Invoke-WebRequest "https://nodejs.org/dist/v$env:NODE_VERSION/SHASUMS256.txt" -OutFile C:\SHASUMS256.txt; `
    $checksumLine = Get-Content C:\SHASUMS256.txt | Where-Object { $_ -match "\s+$([regex]::Escape($archiveName))$" } | Select-Object -First 1; `
    if (-not $checksumLine) { throw "Checksum not found for $archiveName" }; `
    $expected = ($checksumLine -split '\s+')[0].ToUpperInvariant(); `
    $actual = (Get-FileHash $archivePath -Algorithm SHA256).Hash; `
    if ($actual -ne $expected) { throw "Node.js archive checksum mismatch" }; `
    Expand-Archive $archivePath -DestinationPath C:\; `
    Move-Item "C:\node-v$env:NODE_VERSION-win-x64" C:\nodejs; `
    Remove-Item $archivePath, C:\SHASUMS256.txt -Force

ENV PATH="C:\nodejs;${PATH}" `
    CI=true `
    PNPM_VERSION=${PNPM_VERSION} `
    STEAMCMD_CONTRACT_PROFILE=windows `
    STEAMCMD_CONTRACT_OUTPUT_DIR=C:\contract-output

WORKDIR C:\project

RUN corepack.cmd enable; corepack.cmd prepare "pnpm@$env:PNPM_VERSION" --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD ["cmd", "/S", "/C", "pnpm run test:steamcmd:contract"]
