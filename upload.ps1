# Upload frontend files to Git
cd $PSScriptRoot
git add .
git commit -m "Update frontend code"
git push origin main
Write-Host "Upload completed!" -ForegroundColor Green
