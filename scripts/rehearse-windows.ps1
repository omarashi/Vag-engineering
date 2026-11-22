$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project
$connection = [Uri](node --env-file=.env -e "process.stdout.write(process.env.DATABASE_URL)")
if ($connection.Host -notin @('127.0.0.1','localhost')) { throw 'Rehearsal requires a loopback database.' }
$source = $connection.AbsolutePath.TrimStart('/')
$target = 'vag_recovery_' + (Get-Date -Format 'yyyyMMddHHmmss')
$cli = Join-Path $project 'data/tooling/pg-cli/pgsql/bin'
$bash = 'C:/Program Files/Git/bin/bash.exe'
$env:PATH = "$cli;$env:PATH"
$env:PGHOST = $connection.Host
$env:PGPORT = [string]$connection.Port
$userInfo = $connection.UserInfo.Split(':', 2)
$env:PGUSER = [Uri]::UnescapeDataString($userInfo[0])
$env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo[1])
$env:PGDATABASE = $source
$env:BACKUP_ROOT = 'data/rehearsal/backups'
$sourceFiles = node --env-file=.env -e "process.stdout.write(require('node:path').resolve(process.env.ATTACHMENT_DIR || './data/attachments').split(require('node:path').sep).join('/'))"
$env:ATTACHMENT_ROOT = $sourceFiles
$env:BACKUP_KEEP = '4'
$recovered = "data/rehearsal/$target"
New-Item -ItemType Directory -Force -Path $env:BACKUP_ROOT,$env:ATTACHMENT_ROOT,$recovered | Out-Null
try {
  $before = & "$cli/psql.exe" -At -v ON_ERROR_STOP=1 -f scripts/verify-recovery.sql
  if ($LASTEXITCODE -ne 0) { throw 'Source verification failed.' }
  & $bash ./scripts/backup.sh
  if ($LASTEXITCODE -ne 0) { throw 'Backup failed.' }
  $bundle = (Get-ChildItem -LiteralPath $env:BACKUP_ROOT -Directory | Where-Object Name -Match '^\d{8}T\d{6}Z$' | Sort-Object Name -Descending | Select-Object -First 1).Name
  $env:PGDATABASE = 'postgres'
  & "$cli/createdb.exe" -T template0 -E UTF8 -l C $target
  if ($LASTEXITCODE -ne 0) { throw 'Could not create empty recovery database.' }
  $env:PGDATABASE = $target
  $env:ATTACHMENT_ROOT = $recovered
  & $bash ./scripts/restore.sh RESTORE_TO_EMPTY_TARGET $bundle
  if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }
  $after = & "$cli/psql.exe" -At -v ON_ERROR_STOP=1 -f scripts/verify-recovery.sql
  if ($LASTEXITCODE -ne 0 -or (Compare-Object $before $after)) { throw 'Restored totals differ from source.' }
  foreach ($file in (Get-ChildItem -LiteralPath $recovered -File)) {
    $oldHash = (Get-FileHash -LiteralPath (Join-Path $sourceFiles $file.Name) -Algorithm SHA256).Hash
    $newHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    if ($oldHash -ne $newHash) { throw 'Restored attachment differs from source.' }
  }
  Write-Output "Recovery totals and attachment hashes match. Retained isolated database $target."
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

