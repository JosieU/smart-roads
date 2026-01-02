# Quick Deployment Script for Windows PowerShell

Write-Host "🚀 Starting deployment process..." -ForegroundColor Green

# Check if client/build exists
if (-not (Test-Path "client\build")) {
    Write-Host "📦 Building React app..." -ForegroundColor Yellow
    Set-Location client
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
    Set-Location ..
    Write-Host "✅ Build complete!" -ForegroundColor Green
} else {
    Write-Host "✅ Build folder already exists, skipping build..." -ForegroundColor Green
}

# Set production mode
$env:NODE_ENV = "production"

Write-Host "`n🌐 Starting server in production mode..." -ForegroundColor Yellow
Write-Host "   Server will be available at: http://localhost:$env:PORT" -ForegroundColor Cyan
Write-Host "`n💡 To share with others:" -ForegroundColor Yellow
Write-Host "   1. Find your IP: ipconfig" -ForegroundColor White
Write-Host "   2. Share: http://YOUR_IP:$env:PORT" -ForegroundColor White
Write-Host "   3. Or use ngrok: ngrok http $env:PORT" -ForegroundColor White
Write-Host "`nPress Ctrl+C to stop the server`n" -ForegroundColor Gray

# Start server
node server/index.js


