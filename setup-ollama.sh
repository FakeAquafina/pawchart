#!/bin/bash
# Ollama LXC Setup Script for Debian 12
# Run as root inside a fresh LXC: bash setup-ollama.sh
#
# Recommended LXC specs:
#   RAM:  6-8 GB  (model needs ~2.5GB, OS needs the rest)
#   Disk: 15 GB   (Ollama + model files)
#   CPU:  4 cores

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${CYAN}[ollama]${NC} $1"; }
ok()  { echo -e "${GREEN}[  ok  ]${NC} $1"; }
warn(){ echo -e "${YELLOW}[ warn ]${NC} $1"; }

MODEL="${1:-llama3.2:3b}"

echo ""
echo "  🦙 Ollama LXC Setup"
echo "  ─────────────────────────────────────"
echo "  Model: $MODEL"
echo ""

[ "$EUID" -ne 0 ] && { echo "Run as root"; exit 1; }

# ── System deps ───────────────────────────────────────────────────────────
log "Installing dependencies..."
apt-get update -qq
apt-get install -y -qq curl ca-certificates

# ── Install Ollama ────────────────────────────────────────────────────────
log "Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh
ok "Ollama installed: $(ollama --version)"

# ── Configure Ollama to listen on all interfaces ──────────────────────────
# By default Ollama only listens on localhost.
# We need it to accept connections from the PawChart LXC.
log "Configuring Ollama to listen on all interfaces..."

mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF

systemctl daemon-reload
ok "Ollama configured"

# ── Start Ollama ──────────────────────────────────────────────────────────
log "Starting Ollama service..."
systemctl enable ollama
systemctl start ollama
sleep 3
ok "Ollama service running"

# ── Pull model ────────────────────────────────────────────────────────────
log "Pulling model: $MODEL (this may take a few minutes)..."
ollama pull "$MODEL"
ok "Model ready: $MODEL"

# ── Firewall ──────────────────────────────────────────────────────────────
log "Configuring firewall..."
apt-get install -y -qq ufw
ufw --force enable
ufw allow ssh
ufw allow 11434/tcp comment "Ollama API"
ok "Firewall configured"

# ── Test ──────────────────────────────────────────────────────────────────
log "Running a quick test..."
RESULT=$(ollama run "$MODEL" "Reply with only valid JSON: {\"status\": \"ok\"}" 2>/dev/null || echo "error")
if echo "$RESULT" | grep -q "ok"; then
  ok "Model test passed"
else
  warn "Test returned unexpected output — model may still be loading"
  echo "  Output: $RESULT"
fi

# ── Summary ───────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo "  ─────────────────────────────────────────────────"
echo -e "  ${GREEN}✓ Ollama setup complete!${NC}"
echo "  ─────────────────────────────────────────────────"
echo ""
echo "  Ollama API:  http://${IP}:11434"
echo "  Model:       $MODEL"
echo ""
echo "  In your PawChart .env, set:"
echo "    OLLAMA_URL=http://${IP}:11434"
echo "    OLLAMA_MODEL=$MODEL"
echo ""
echo "  Test from PawChart LXC:"
echo "    curl http://${IP}:11434/api/tags"
echo "  ─────────────────────────────────────────────────"
echo ""
