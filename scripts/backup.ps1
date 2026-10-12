$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$backupDir = Join-Path "backups" (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
docker compose exec -T db sh -c 'pg_dump -U lanxiang_owner -d lanxiang -Fc -f /tmp/lanxiang.dump'
if ($LASTEXITCODE -ne 0) { throw "数据库导出失败" }
docker compose cp db:/tmp/lanxiang.dump (Join-Path $backupDir "lanxiang.dump")
if ($LASTEXITCODE -ne 0) { throw "备份复制失败" }
Copy-Item .env (Join-Path $backupDir "config.env")
Write-Host "备份完成：$backupDir"
