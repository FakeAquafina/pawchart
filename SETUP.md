# PawChart — Complete Setup Guide

This guide walks you through everything from zero to a fully deployed,
auto-updating PawChart on your Proxmox server. Take it one section at a time.

---

## Overview

When you're done, this is how updates will work:

```
You edit a file on your computer
        ↓
git add . && git commit -m "my change" && git push
        ↓
GitHub automatically runs tests
        ↓
If tests pass → GitHub SSHs into your server and deploys
        ↓
Your live app is updated — no manual steps
```

---

## Part 1 — GitHub Setup

### 1.1 Create a GitHub account
If you don't have one: https://github.com/signup

### 1.2 Create a new repository
1. Go to https://github.com/new
2. Name it `pawchart`
3. Set it to **Private**
4. Leave everything else unchecked (no README, no .gitignore — we have our own)
5. Click **Create repository**

Keep this page open — you'll need the repo URL in a moment.

---

## Part 2 — Git on Your Computer

### 2.1 Install Git
- **Windows:** https://git-scm.com/download/win
- **Mac:** `brew install git` or it may already be installed
- **Linux:** `sudo apt install git`

### 2.2 Configure Git (one time only)
Open a terminal and run:
```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 2.3 Initialize the repo
```bash
# Navigate to the pawchart folder (wherever you unzipped it)
cd pawchart

# Initialize git
git init

# Connect to your GitHub repo
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/pawchart.git

# Stage all files
git add .

# First commit
git commit -m "Initial commit"

# Push to GitHub
git push -u origin main
```

Go to your GitHub repo — you should see all the files there now.

> **Tip:** If git push asks for a password, GitHub no longer accepts passwords.
> You need a Personal Access Token instead.
> Go to: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
> Give it `repo` scope, copy it, and use it as your password.

---

## Part 3 — Server Setup

Do these steps in order. Each one builds on the last.

### 3.1 Create two LXCs in Proxmox

**Ollama LXC** (for AI parsing):
```
Template: debian-12-standard
Hostname: ollama
RAM:      6144 MB (6 GB)
Disk:     15 GB
CPU:      4 cores
Network:  assign a static IP (e.g. 192.168.1.51)
```

**PawChart LXC** (for the app):
```
Template: debian-12-standard
Hostname: pawchart
RAM:      512 MB
Disk:     8 GB
CPU:      2 cores
Network:  assign a static IP (e.g. 192.168.1.50)
```

Write down both IP addresses.

### 3.2 Set up Ollama LXC first
Open a shell on the Ollama LXC and run:
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/pawchart/main/setup-ollama.sh | bash
```

Or copy the file over manually:
```bash
# From your computer:
scp setup-ollama.sh root@192.168.1.51:/root/
# Then in the Ollama LXC:
bash setup-ollama.sh
```

This will take a few minutes while it downloads the AI model (~2 GB).
When it finishes it prints the IP — note it for the next step.

### 3.3 Set up PawChart LXC
Open a shell on the PawChart LXC:

```bash
# Install git and required system packages first
apt-get update && apt-get install -y git graphicsmagick ghostscript

# Clone your repo directly from GitHub
git clone https://github.com/YOUR_USERNAME/pawchart.git /opt/pawchart

# Run setup
cd /opt/pawchart
bash setup.sh
```

### 3.4 Configure environment
```bash
nano /opt/pawchart/server/.env
```

Fill it in:
```env
PORT=3456
DB_PATH=./pawchart.db
UPLOADS_DIR=./uploads
OLLAMA_URL=http://192.168.1.51:11434
OLLAMA_MODEL=llama3.2:3b
```
Save with `Ctrl+O`, exit with `Ctrl+X`.

### 3.5 Build frontend and start
```bash
cd /opt/pawchart/client
npm install
npm run build

systemctl start pawchart
systemctl status pawchart

# Verify it's working:
curl http://localhost:3456/api/health
```

You should see `"status":"ok"` and `"ollama":{"status":"ok"}`.

---

## Part 4 — GitHub Auto-Deploy Setup

This is what lets GitHub automatically update your server when you push code.

### 4.1 Create the deploy user on PawChart LXC
```bash
# On the PawChart LXC, as root:
bash /opt/pawchart/setup-deploy-user.sh
```

This script will:
- Create a restricted `deploy` user
- Generate an SSH keypair for it
- Print the **private key** at the end

**Copy that entire private key** (including the `-----BEGIN` and `-----END` lines).

### 4.2 Open an SSH port on your router
In your router's port forwarding settings:
```
External port: 2222
Internal IP:   192.168.1.50   (your PawChart LXC IP)
Internal port: 22
Protocol:      TCP
```

This lets GitHub reach your server. Using port 2222 instead of 22 reduces
noise from automated scanners — your server stays secure because only the
deploy key works regardless.

### 4.3 Find your public IP
Go to https://whatismyip.com and note your public IP address.

### 4.4 Add secrets to GitHub
Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these three secrets:

| Secret name | Value |
|-------------|-------|
| `DEPLOY_HOST` | Your public IP (e.g. `203.0.113.42`) |
| `DEPLOY_PORT` | `2222` |
| `DEPLOY_SSH_KEY` | The private key from step 4.1 |

### 4.5 Test the deployment
Make a small change — edit `client/src/App.jsx` and change something minor,
or just add a comment. Then:

```bash
git add .
git commit -m "test: trigger first auto-deploy"
git push
```

Go to your GitHub repo → **Actions** tab.
You'll see the workflow running. Click on it to watch the live logs.
If everything goes green — you're fully set up! 🎉

---

## Part 5 — Caddy Setup

Add this to your existing Caddyfile (replace the IP and domain):

```caddyfile
pawchart.yourdomain.com {
    reverse_proxy 192.168.1.50:3456

    request_body {
        max_size 25MB
    }

    header {
        Strict-Transport-Security "max-age=31536000;"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        -Server
    }
}
```

Reload Caddy:
```bash
systemctl reload caddy
```

---

## Your Daily Git Workflow

After setup, this is all you need to know:

```bash
# Check what files you've changed
git status

# Stage your changes
git add .

# Save a snapshot with a message
git commit -m "describe what you changed"

# Push to GitHub (triggers auto-deploy)
git push
```

**To see what's deployed:** Go to GitHub → Actions tab.
**To see app logs:** SSH into PawChart LXC → `journalctl -u pawchart -f`
**To track a bug or idea:** Go to GitHub → Issues → New Issue

---

## Troubleshooting

**Deploy workflow is failing:**
- Click on the failed workflow in the Actions tab to see the exact error
- Common cause: wrong IP, port not forwarded yet, or service failed to restart
- Check logs: `journalctl -u pawchart -n 50` on the PawChart LXC

**Ollama shows as unreachable in health check:**
- Make sure Ollama LXC is running: `systemctl status ollama` (on Ollama LXC)
- Verify PawChart can reach it: `curl http://192.168.1.51:11434/api/tags`
- Check the IP in your `.env` is correct

**Receipt scan returns garbled results:**
- Take the photo in good lighting, flat on a surface
- Make sure the whole receipt is in frame
- PDFs from the vet's email work better than photos

**git push asks for a password:**
- Use a Personal Access Token, not your GitHub password
- Generate one at: GitHub → Settings → Developer settings → Personal access tokens
