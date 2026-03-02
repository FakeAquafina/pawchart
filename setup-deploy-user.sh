#!/bin/bash
# setup-deploy-user.sh
# Run ONCE as root on your PawChart LXC to set up the deploy user
# This creates the restricted user that GitHub Actions will SSH in as

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${CYAN}[setup]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $1"; }

[ "$EUID" -ne 0 ] && { echo "Run as root"; exit 1; }

APP_DIR="/opt/pawchart"

# ── Create deploy user ────────────────────────────────────────────────────
log "Creating deploy user..."
if ! id -u deploy &>/dev/null; then
  useradd --system --shell /bin/bash --create-home --home-dir /home/deploy deploy
  ok "User 'deploy' created"
else
  warn "User 'deploy' already exists"
fi

# ── Generate SSH keypair for GitHub Actions ───────────────────────────────
log "Generating SSH deploy keypair..."
KEYDIR="/home/deploy/.ssh"
mkdir -p "$KEYDIR"

if [ ! -f "$KEYDIR/deploy_key" ]; then
  ssh-keygen -t ed25519 -C "pawchart-github-deploy" -f "$KEYDIR/deploy_key" -N ""
  ok "Keypair generated"
else
  warn "Keypair already exists at $KEYDIR/deploy_key"
fi

# Install the public key as an authorized key for the deploy user
cat "$KEYDIR/deploy_key.pub" > "$KEYDIR/authorized_keys"
chmod 700 "$KEYDIR"
chmod 600 "$KEYDIR/authorized_keys" "$KEYDIR/deploy_key"
chown -R deploy:deploy "$KEYDIR"
ok "Public key installed"

# ── Grant deploy user access to the app directory ────────────────────────
log "Setting up app directory permissions..."
chown -R deploy:deploy "$APP_DIR"
ok "deploy user owns $APP_DIR"

# ── sudoers: allow deploy to restart only the pawchart service ────────────
log "Configuring sudoers..."
cat > /etc/sudoers.d/deploy-pawchart << 'EOF'
# Allow the deploy user to restart only the pawchart service
# This is the minimum permission needed for automated deploys
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart pawchart
deploy ALL=(ALL) NOPASSWD: /bin/systemctl status pawchart
EOF
chmod 440 /etc/sudoers.d/deploy-pawchart
ok "sudoers configured (restart pawchart only)"

# ── Copy deploy script ────────────────────────────────────────────────────
log "Installing deploy script..."
cp "$APP_DIR/deploy.sh" /opt/pawchart/deploy.sh
chmod +x /opt/pawchart/deploy.sh
chown deploy:deploy /opt/pawchart/deploy.sh
ok "deploy.sh installed at /opt/pawchart/deploy.sh"

# ── SSH hardening for deploy user ─────────────────────────────────────────
log "Hardening SSH config..."
# Add a Match block if not already present
if ! grep -q "Match User deploy" /etc/ssh/sshd_config 2>/dev/null; then
  cat >> /etc/ssh/sshd_config << 'EOF'

# Deploy user: key-only, no password, no interactive shell tricks
Match User deploy
    PasswordAuthentication no
    PubkeyAuthentication yes
    PermitTTY no
    AllowAgentForwarding no
    X11Forwarding no
    ForceCommand /opt/pawchart/deploy.sh
EOF
  systemctl reload sshd
  ok "SSH hardened for deploy user (key-only, forced command)"
else
  warn "SSH Match block already exists — skipping"
fi

# ── Print private key for GitHub Secrets ─────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Deploy user setup complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next: add these 3 secrets to your GitHub repo"
echo "  (Settings → Secrets and variables → Actions → New secret)"
echo ""
echo "━━ Secret 1: DEPLOY_HOST ━━"
echo "  Your public IP or domain pointing at this server"
echo "  e.g. 203.0.113.42  or  pawchart.yourdomain.com"
echo ""
echo "━━ Secret 2: DEPLOY_PORT ━━"
echo "  The external SSH port you forward to this LXC"
echo "  e.g. 2222"
echo ""
echo "━━ Secret 3: DEPLOY_SSH_KEY ━━"
echo "  Copy everything below (including BEGIN/END lines):"
echo ""
cat "$KEYDIR/deploy_key"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Then on your router:"
echo "  Forward external port 2222 → this LXC's IP port 22"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
