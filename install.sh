#!/bin/bash
set -e

echo "=== Viviti Device Install ==="

# Install Node.js 20
if ! command -v node &> /dev/null; then
  echo "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js: $(node -v)"

# Create install directory
mkdir -p /opt/viviti

# Clone or update repo
if [ -d "/opt/viviti/.git" ]; then
  echo "Updating existing install..."
  git -C /opt/viviti pull
else
  echo "Cloning viviti-device repo..."
  git clone https://github.com/prasad3131/viviti-device.git /opt/viviti
fi

# Install dependencies
cd /opt/viviti
npm install --omit=dev

# Create photo directory placeholder (USB drive mounts here)
mkdir -p /media/usb/photos

# Install systemd service
cp /opt/viviti/viviti.service /etc/systemd/system/viviti.service
systemctl daemon-reload
systemctl enable viviti
systemctl restart viviti

echo ""
echo "=== Install complete ==="
echo "Status: $(systemctl is-active viviti)"
echo "Logs:   journalctl -u viviti -f"
