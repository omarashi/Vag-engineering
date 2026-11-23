[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$demoRoot = Join-Path $project 'data/vercel-demo'
$staging = Join-Path $demoRoot ('source-' + (Get-Date -Format 'yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$sourceDirectories = 'app', 'components', 'lib', 'prisma', 'public'
foreach ($directory in $sourceDirectories) {
    $source = Join-Path $project $directory
    Copy-Item -LiteralPath $source -Destination $staging -Recurse -Exclude '.env*', '*.key', '*.pem', '*.p12', '*.dump'
}

$sourceFiles = 'package.json', 'package-lock.json', 'next.config.mjs', 'postcss.config.mjs', 'prisma.config.ts', 'tsconfig.json'
foreach ($file in $sourceFiles) {
    Copy-Item -LiteralPath (Join-Path $project $file) -Destination $staging
}

$stagedScripts = Join-Path $staging 'scripts'
New-Item -ItemType Directory -Path $stagedScripts | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bootstrap.ts') -Destination $stagedScripts

@{
    '$schema' = 'https://openapi.vercel.sh/vercel.json'
    framework = 'nextjs'
    buildCommand = 'npm run db:generate && npm run build'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $staging 'vercel.json') -Encoding Ascii

@('.env*', 'data/', 'backups/', 'test-results/', '*.dump', '*.key', '*.pem', '*.p12') |
    Set-Content -LiteralPath (Join-Path $staging '.vercelignore') -Encoding Ascii

Write-Output $staging
