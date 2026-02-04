#Requires -Version 5.1
# 仅本脚本打包部署的前端访问生产后端（同源 /api/，Nginx 代理到 :8001）。
# 开发模式 (npm run dev) 不改动，仍使用默认 127.0.0.1:8080。
# 从项目根目录执行: .\scripts\deploy-frontend.ps1

$ErrorActionPreference = "Stop"

# 生产环境
$ServerHost = "140.143.242.140"
$BackendPort = 8001
$ServerUser = "root"
$RemoteDeployDir = "~/erpxy-frontend-deploy"
$WebRoot = "/root/www/erpxy"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DistDir = Join-Path $ProjectRoot "dist"
$ZipPath = Join-Path $env:TEMP "erpxy_frontend.zip"
$NginxConf = Join-Path $PSScriptRoot "nginx-erpxy.conf"

function Write-Step { param($Msg) Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host "   $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "   $Msg" -ForegroundColor Yellow }

# 打包时：base /erpxy/，ERP API 使用生产地址，请求 http://ServerHost/api/... 由 Nginx 代理到后端 :8001
# 空字符串在 Vite 构建中可能不生效，故显式写死生产 origin
Write-Step "Building frontend for production (base /erpxy/, API -> http://${ServerHost}/api/ -> backend :$BackendPort)..."
$env:VITE_BASE_PATH = "/erpxy/"
$env:VITE_ERP_API_BASE = "http://${ServerHost}"
Push-Location $ProjectRoot
try {
    npx vite build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
} finally {
    Pop-Location
}
Write-Ok "Build done: $DistDir"

if (-not (Test-Path $DistDir)) { throw "dist not found: $DistDir" }

# Zip dist with forward slashes for Linux
Write-Step "Zipping dist..."
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Add-Type -AssemblyName System.IO.Compression.FileSystem
# ZipArchiveMode.Create = 1 (avoid loading extra assembly)
$zip = [System.IO.Compression.ZipFile]::Open($ZipPath, 1)
$distLen = $DistDir.TrimEnd("\").Length + 1
Get-ChildItem -Path $DistDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($distLen).Replace("\", "/")
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel)
}
$zip.Dispose()
Write-Ok "Zip: $ZipPath"

# Upload zip and nginx config
Write-Step "Uploading to $ServerUser@${ServerHost}:$RemoteDeployDir/"
& ssh -o StrictHostKeyChecking=accept-new "${ServerUser}@${ServerHost}" "mkdir -p $RemoteDeployDir"
if ($LASTEXITCODE -ne 0) { throw "ssh mkdir failed" }
& scp -o StrictHostKeyChecking=accept-new $ZipPath "${ServerUser}@${ServerHost}:${RemoteDeployDir}/deploy-frontend.zip"
if ($LASTEXITCODE -ne 0) { throw "scp zip failed" }
& scp -o StrictHostKeyChecking=accept-new $NginxConf "${ServerUser}@${ServerHost}:${RemoteDeployDir}/nginx-erpxy.conf"
if ($LASTEXITCODE -ne 0) { throw "scp nginx config failed" }
Write-Ok "Upload done"

# On server: unzip, install nginx if needed, copy config, reload
$remoteCmd = "cd $RemoteDeployDir && mkdir -p $WebRoot && unzip -o -q deploy-frontend.zip -d $WebRoot && (command -v nginx >/dev/null 2>&1 || dnf install -y nginx 2>/dev/null) && mkdir -p /etc/nginx/conf.d && cp nginx-erpxy.conf /etc/nginx/conf.d/erpxy.conf && nginx -t 2>/dev/null && (systemctl enable nginx 2>/dev/null; systemctl start nginx 2>/dev/null; systemctl reload nginx 2>/dev/null); exit 0"
Write-Step "Running on server (unzip, nginx)..."
& ssh -o StrictHostKeyChecking=accept-new "${ServerUser}@${ServerHost}" $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "ssh deploy failed" }
Write-Ok "Deploy done"

Remove-Item -Force $ZipPath -ErrorAction SilentlyContinue
Write-Host ""
Write-Ok "Frontend: http://${ServerHost}/erpxy/"
Write-Ok "API: http://${ServerHost}/api/ -> backend :$BackendPort"
