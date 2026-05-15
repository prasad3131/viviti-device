#!/bin/bash
# Reconnects wlan0 to the saved profile if WiFi drops.
# Runs every 2 minutes via systemd timer.

if nmcli -t -f TYPE,STATE d | grep -q "wifi:connected"; then
  exit 0
fi

# WiFi is down — try to reconnect
nmcli dev set wlan0 managed yes 2>/dev/null
nmcli con up shivaru-2g ifname wlan0 2>/dev/null && exit 0

# Still failing — reboot as last resort
logger -t wifi-watchdog "WiFi reconnect failed, rebooting"
systemctl reboot
