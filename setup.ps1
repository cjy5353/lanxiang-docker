$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
docker run --rm -v "${PSScriptRoot}:/workspace" -w /workspace node:24-alpine node scripts/setup.mjs
if ($LASTEXITCODE -ne 0) { throw "配置生成失败，请查看上面的错误。如果 .env 已存在，请保留它并继续启动。" }
