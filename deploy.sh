#!/bin/bash
# /opt/pawchart/deploy.sh
# Run by the 'deploy' user via GitHub Actions SSH
# This script is the only thing the deploy user is allowed to run (enforced via sudoers)

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $1"; }
fail() { echo -e "${RED}[error ]${NC} $1"; exit 1; }

APP_DIR="/opt/pawchart"
SERVICE="pawchart"

log "Starting deployment..."
log "Commit: $(git -C $APP_DIR rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

# ── Pull latest code ──────────────────────────────────────────────────────
log "Pulling latest code from GitHub..."
git -C "$APP_DIR" fetch origin main
git -C "$APP_DIR" reset --hard origin/main
ok "Code updated"

# ── Install/update server dependencies ───────────────────────────────────
log "Installing server dependencies..."
cd "$APP_DIR/server"
npm ci --omit=dev --silent
ok "Server deps ready"

# ── Build frontend ────────────────────────────────────────────────────────
log "Building frontend..."
cd "$APP_DIR/client"
npm ci --silent
npm run build --silent
ok "Frontend built → server/public/"

# ── Restart service ───────────────────────────────────────────────────────
log "Restarting pawchart service..."
sudo systemctl restart "$SERVICE"

# Wait and verify it came back up
sleep 3
if systemctl is-active --quiet "$SERVICE"; then
  ok "Service is running"
else
  fail "Service failed to start — check: journalctl -u $SERVICE -n 50"
fi

# ── Health check ──────────────────────────────────────────────────────────
log "Running health check..."
sleep 2
HEALTH=$(curl -sf http://localhost:3456/api/health 2>/dev/null || echo "failed")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "Health check passed"
else
  fail "Health check failed. Response: $HEALTH"
fi

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "   $(date)"
echo "   $(git -C $APP_DIR log -1 --pretty='%h — %s (%an)')"
echo ""
