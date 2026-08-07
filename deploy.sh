set -e
cd /vol1/1000/Docker/Workbench
if docker ps >/dev/null 2>&1; then SUDO=""; else SUDO="sudo"; fi
$SUDO docker compose down
$SUDO docker compose up -d --build
sleep 5
echo "=== STATUS ==="
$SUDO docker compose ps
echo "=== HEALTH ==="
curl -s http://127.0.0.1:4174/api/health
echo
echo "=== LOGS ==="
$SUDO docker compose logs --tail=20