#!/bin/bash
# PawChart Setup Script for Debian 12 LXC
# Run as root: bash setup.sh

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${CYAN}[pawchart]${NC} $1"; }
ok()  { echo -e "${GREEN}[  ok  ]${NC} $1"; }
warn(){ echo -e "${YELLOW}[ warn ]${NC} $1"; }
err() { echo -e "${RED}[error ]${NC} $1"; exit 1; }

echo ""
echo "  🐾 PawChart Setup"
echo "  ─────────────────────────────────────"
echo ""

# ── Root check ────────────────────────────────────────────────────────────
[ "$EUID" -ne 0 ] && err "Please run as root"

# ── System update ─────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
ok "System updated"

# ── Node.js 20 LTS ────────────────────────────────────────────────────────
log "Installing Node.js 20 LTS..."
apt-get install -y -qq curl ca-certificates gnupg
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update -qq
apt-get install -y -qq nodejs
ok "Node.js $(node --version) installed"

# ── App user ──────────────────────────────────────────────────────────────
log "Creating pawchart system user..."
if ! id -u pawchart &>/dev/null; then
  useradd --system --shell /usr/sbin/nologin --create-home --home-dir /opt/pawchart pawchart
  ok "User created"
else
  warn "User already exists, skipping"
fi

# ── App directory ─────────────────────────────────────────────────────────
log "Setting up app directory..."
mkdir -p /opt/pawchart/server/uploads
cp -r ./server /opt/pawchart/
chown -R pawchart:pawchart /opt/pawchart
ok "Directory ready at /opt/pawchart"

# ── .env setup ────────────────────────────────────────────────────────────
if [ ! -f /opt/pawchart/server/.env ]; then
  log "Creating .env file..."
  cp /opt/pawchart/server/.env.example /opt/pawchart/server/.env
  chown pawchart:pawchart /opt/pawchart/server/.env
  chmod 600 /opt/pawchart/server/.env

  echo ""
  warn "────────────────────────────────────────────────────"
  warn " ACTION REQUIRED: Add your Anthropic API key"
  warn " Edit: /opt/pawchart/server/.env"
  warn " Get a key at: https://console.anthropic.com"
  warn "────────────────────────────────────────────────────"
  echo ""
else
  warn ".env already exists, skipping"
fi

# ── npm install ───────────────────────────────────────────────────────────
log "Installing Node dependencies..."
cd /opt/pawchart/server
sudo -u pawchart npm install --omit=dev --silent
ok "Dependencies installed"

# ── Systemd service ───────────────────────────────────────────────────────
log "Installing systemd service..."
cp /home/claude/pawchart/pawchart.service /etc/systemd/system/pawchart.service
sed -i 's|/opt/pawchart/server|/opt/pawchart/server|g' /etc/systemd/system/pawchart.service
systemctl daemon-reload
systemctl enable pawchart
ok "Service installed and enabled"

# ── Firewall ──────────────────────────────────────────────────────────────
log "Configuring firewall..."
apt-get install -y -qq ufw
ufw --force enable
ufw allow ssh
ufw allow 3456/tcp comment "PawChart API"
ok "Firewall configured (SSH + port 3456 open)"

# ── Summary ───────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo "  ─────────────────────────────────────────────────"
echo -e "  ${GREEN}✓ PawChart setup complete!${NC}"
echo "  ─────────────────────────────────────────────────"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Add your Anthropic API key:"
echo "     nano /opt/pawchart/server/.env"
echo ""
echo "  2. Start the service:"
echo "     systemctl start pawchart"
echo ""
echo "  3. Check it's running:"
echo "     systemctl status pawchart"
echo "     curl http://${IP}:3456/api/health"
echo ""
echo "  4. Add to Caddy (see Caddyfile.example)"
echo ""
echo "  Local API: http://${IP}:3456"
echo "  ─────────────────────────────────────────────────"
echo ""
