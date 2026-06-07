#!/bin/bash
# WiFi402 — One-time hotspot + firewall setup
# Run as root from the project root: sudo bash scripts/setup-pf.sh
#
# What this does:
#   1. Verifies macOS Internet Sharing is active (bridge100 exists)
#   2. Wires the wifi402 PF anchor into /etc/pf.conf
#   3. Loads the anchor rules
#   4. Enables PF
#   5. Verifies the firewall is active
#
# Prerequisites:
#   - Enable Internet Sharing first:
#       System Settings → General → Sharing → Internet Sharing
#       Share your connection from: Wi-Fi (or Ethernet)
#       To computers using: Wi-Fi
#   - Run this script from the project root directory

set -e

ANCHOR_NAME="wifi402"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANCHOR_CONF="$SCRIPT_DIR/../pf/wifi402.conf"
PF_CONF="/etc/pf.conf"
HOTSPOT_IF="bridge100"

echo "=== WiFi402 Firewall Setup ==="
echo ""

# 1. Check Internet Sharing is on (bridge100 must exist)
if ! ifconfig "$HOTSPOT_IF" &>/dev/null; then
  echo "ERROR: $HOTSPOT_IF interface not found."
  echo ""
  echo "Please enable Internet Sharing first:"
  echo "  System Settings → General → Sharing → Internet Sharing"
  echo "  Share from: Wi-Fi (or your internet connection)"
  echo "  To computers using: Wi-Fi"
  echo ""
  echo "After enabling Internet Sharing, re-run this script."
  exit 1
fi

HOTSPOT_IP=$(ifconfig "$HOTSPOT_IF" | awk '/inet / {print $2}')
echo "✓ $HOTSPOT_IF is active (IP: $HOTSPOT_IP)"
echo ""

# 2. Wire anchor into /etc/pf.conf if not already present
if grep -q "wifi402" "$PF_CONF" 2>/dev/null; then
  echo "✓ wifi402 anchor already in $PF_CONF"
else
  # Find the last 'anchor' or 'load anchor' line and insert after it,
  # or just append if none found
  cat >> "$PF_CONF" << EOF

# WiFi402 — pay-per-use hotspot firewall
anchor "wifi402"
load anchor "wifi402" from "$ANCHOR_CONF"
EOF
  echo "✓ Added wifi402 anchor to $PF_CONF"
fi

echo ""

# 3. Enable PF
pfctl -e 2>/dev/null && echo "✓ PF enabled" || echo "✓ PF was already enabled"

# 4. Load the main ruleset (picks up the new anchor)
pfctl -f "$PF_CONF" 2>/dev/null && echo "✓ Loaded $PF_CONF" || true

# 5. Load the anchor rules directly
pfctl -a "$ANCHOR_NAME" -f "$ANCHOR_CONF" && echo "✓ Loaded wifi402 anchor rules"

echo ""

# 6. Verify
echo "--- PF Status ---"
pfctl -s info | grep -E "^Status|^Debug"
echo ""

echo "--- Active anchor rules ---"
pfctl -a "$ANCHOR_NAME" -s rules 2>/dev/null || echo "(none yet)"
echo ""

echo "--- Paid users table (empty until first payment) ---"
pfctl -a "$ANCHOR_NAME" -t paid_users -T show 2>/dev/null || echo "(empty)"
echo ""

echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Add NOPASSWD for pfctl so Next.js can manage the firewall:"
echo "     sudo visudo"
echo "     Add: $(whoami) ALL=(ALL) NOPASSWD: /sbin/pfctl"
echo ""
echo "  2. Start the WiFi402 app:"
echo "     cd $(dirname "$SCRIPT_DIR") && npm run dev"
echo ""
echo "  3. Connect a device to your hotspot. It will be blocked until payment."
echo "     The browser will auto-redirect to http://$HOTSPOT_IP:3000"
