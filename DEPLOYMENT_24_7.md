# 24/7 Linux Production Deployment Guide
**Project:** Country Flag Battle Arena  
**OS:** Ubuntu 26.04.1 LTS (Linux 6.x)  
**Node.js:** v24.21.0  

---

## 1. Quick Start Commands

To build and start the application immediately:
```bash
cd /home/abdul-jabbar/game/country-battle-arena

# Install dependencies if not already installed
npm install

# Build production assets
npm run build

# Run automated tests
npm test

# Start the production static server
./scripts/start.sh
```

To inspect status:
```bash
./scripts/status.sh
```

To stop:
```bash
./scripts/stop.sh
```

---

## 2. 24/7 Automated Systemd Service (Recommended)

Systemd ensures the game starts automatically when the Ubuntu machine boots and restarts automatically if any unexpected crash occurs.

### Step 1: Install the Service Unit
```bash
mkdir -p ~/.config/systemd/user
cp /home/abdul-jabbar/game/country-battle-arena/systemd/country-battle.service ~/.config/systemd/user/
```

### Step 2: Enable & Start the Service
```bash
systemctl --user daemon-reload
systemctl --user enable country-battle.service
systemctl --user start country-battle.service
```

### Step 3: Verify Service Status
```bash
systemctl --user status country-battle.service
```

### Step 4: Enable User Lingering (Boot Without Login)
To ensure systemd runs the service automatically even before you log into the desktop:
```bash
loginctl enable-linger abdul-jabbar
```

### Step 5: Viewing Live Production Logs
```bash
journalctl --user -u country-battle.service -f
# or view file logs:
tail -f /home/abdul-jabbar/game/country-battle-arena/logs/server.log
```

---

## 3. Configuration & URL Tuning

The application accepts query parameters directly through the URL without requiring recompilation:

| Parameter | Purpose | Example |
| :--- | :--- | :--- |
| `game` | Directly launches specific game mode (`battle`, `eliminate`, `line`) | `?game=line` |
| `mode` | Execution mode (`once`, `timed`, `infinite`) | `?mode=infinite` |
| `profile` | Visual quality profile (`AUTO`, `LOW`, `BALANCED`, `HIGH`) | `?profile=BALANCED` |
| `broadcast` | Toggles clean 1280x720 OBS broadcast mode | `?broadcast=true` |
| `count` | Sets number of participating nations (2–24) | `?count=16` |
| `debug` | Toggles in-canvas real-time FPS & physics diagnostics | `?debug=true` |
| `fps` | Custom simulation target FPS (30–120) | `?fps=60` |

**Example OBS URLs:**
```
# Country Line Battle Arena (Line Tether Survival)
http://127.0.0.1:3000/?game=line&mode=infinite&profile=BALANCED

# Country Battle Arena (Kinetic Impact Combat)
http://127.0.0.1:3000/?game=battle&mode=infinite&profile=BALANCED

# Country Eliminate Arena (Rotating Gap Hazard)
http://127.0.0.1:3000/?game=eliminate&mode=infinite&profile=BALANCED
```

---

## 4. Maintenance & Recovery

### Log Rotation
Server logs are written to `logs/server.log`. A standard logrotate configuration can be placed in `/etc/logrotate.d/country-battle`:
```
/home/abdul-jabbar/game/country-battle-arena/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
}
```
