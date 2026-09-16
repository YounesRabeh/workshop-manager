# escape=`
FROM mcr.microsoft.com/windows/servercore:ltsc2022

ARG NODE_VERSION=24.18.0

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
    STEAMCMD_CONTRACT_PROFILE=windows `
    STEAMCMD_CONTRACT_OUTPUT_DIR=C:\contract-output

WORKDIR C:\project

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN $packageManager = (Get-Content package.json -Raw | ConvertFrom-Json).packageManager; `
    if ($packageManager -notmatch '^pnpm@([^+]+)') { throw 'package.json must declare packageManager as pnpm@<version>.' }; `
    npm install --global "pnpm@$($Matches[1])"; `
    pnpm --version; `
    pnpm install --frozen-lockfile

COPY . .

CMD ["cmd", "/S", "/C", "pnpm run test:steamcmd:contract"]
