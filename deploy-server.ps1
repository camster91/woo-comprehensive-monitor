# Deploy server updates to Coolify container

$ServerIP = "187.77.26.99"
$ContainerID = "as80wsgckw0wo0kk4gcggkcg-182045549329"
$ServerDir = "server"

Write-Host "=== Deploying server updates ===" -ForegroundColor Cyan

# Check if we have SSH access
$sshTest = ssh -o ConnectTimeout=5 root@$ServerIP "echo 'SSH connection successful'" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH connection failed. Trying alternate method..." -ForegroundColor Yellow
    
    # Use Coolify API
    $apiUrl = "http://${ServerIP}:8000/api/v1/applications/as80wsgckw0wo0kk4gcggkcg/deploy"
    $apiKey = "2|OyUt8feqoaBUVu1Uvvkq59CCqNjIdj4j2Vf0OXYf"
    
    Write-Host "Attempting deploy via Coolify API..." -ForegroundColor Cyan
    $result = curl -X POST $apiUrl -H "Authorization: Bearer $apiKey" -H "Content-Type: application/json" 2>&1
    Write-Host "Deploy result: $result" -ForegroundColor Green
    
} else {
    Write-Host "SSH connection successful" -ForegroundColor Green
    
    # Copy files to container via docker cp
    Write-Host "Copying server files..." -ForegroundColor Cyan
    
    # First copy to temp location on server
    $tempFile = "/tmp/server-update-$(Get-Date -Format 'yyyyMMddHHmmss')"
    ssh root@$ServerIP "mkdir -p $tempFile"
    
    # Upload server.js
    if (Test-Path "$ServerDir\server.js") {
        scp "$ServerDir\server.js" "root@${ServerIP}:${tempFile}/server.js" 2>&1 | Out-Null
        Write-Host "Uploaded server.js" -ForegroundColor Green
    }
    
    # Upload dashboard-enhanced.html  
    if (Test-Path "$ServerDir\dashboard-enhanced.html") {
        scp "$ServerDir\dashboard-enhanced.html" "root@${ServerIP}:${tempFile}/dashboard-enhanced.html" 2>&1 | Out-Null
        Write-Host "Uploaded dashboard-enhanced.html" -ForegroundColor Green
    }
    
    # Copy into container
    Write-Host "Copying files into container..." -ForegroundColor Cyan
    ssh root@$ServerIP "docker cp $tempFile/server.js $ContainerID:/usr/src/app/server.js 2>/dev/null || echo 'server.js copy failed (permissions?)'"
    ssh root@$ServerIP "docker cp $tempFile/dashboard-enhanced.html $ContainerID:/usr/src/app/dashboard-enhanced.html 2>/dev/null || echo 'dashboard copy failed (permissions?)'"
    
    # Restart container
    Write-Host "Restarting container..." -ForegroundColor Cyan
    ssh root@$ServerIP "docker restart $ContainerID"
    
    Write-Host "Waiting 10 seconds..." -ForegroundColor Cyan
    Start-Sleep -Seconds 10
    
    # Check container status
    Write-Host "Checking container..." -ForegroundColor Cyan
    ssh root@$ServerIP "docker ps -f 'id=$ContainerID' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
}

Write-Host "=== Deployment complete ===" -ForegroundColor Cyan
Write-Host "Dashboard: https://woo.ashbi.ca/dashboard" -ForegroundColor Yellow
Write-Host "Server logs: ssh root@${ServerIP} 'docker logs --tail 20 $ContainerID'" -ForegroundColor Yellow