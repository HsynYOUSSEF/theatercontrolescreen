# 🎭 Theater Control System — README

A multi-screen theater display control system built with Node.js, WebSocket, and WebRTC. Control all theater screens from a single tablet or laptop browser.

---

## 📁 Project Structure

```
theater-system/
├── server/
│   ├── server.js          ← Main Node.js server
│   └── package.json       ← Dependencies
├── tablet/
│   └── index.html         ← Tablet controller UI
├── screen/
│   └── index.html         ← Screen display page (runs on each Pi)
├── uploads/
│   └── sessions/          ← Uploaded media files
│       ├── default/       ← General session
│       └── [session-id]/  ← Custom sessions
└── data/
    ├── sectors.json        ← Saved sector content
    ├── sector-structure.json ← Saved sector list (add/delete)
    ├── history.json        ← Launch history per sector
    └── sessions.json       ← Library session metadata
```

---

## 🚀 How to Launch the Server

### Requirements
- Node.js v18 or higher
- Windows, Mac, or Linux

### First Time Setup
```cmd
cd theater-system\server
npm install
```

### Start the Server
**Always use CMD (not PowerShell) on Windows:**
```cmd
cd theater-system\server
node server.js
```

You will be prompted to enter credentials:
```
─── Admin Account ───
 Admin username: lapp
 Admin password: ****

─── Viewer Account ───
 Viewer username: gfs
 Viewer password: ****
```

Server will start and show:
```
Theater Control Server — RUNNING

 Tablet  → http://[YOUR-IP]:3000/tablet/
 Screen  → http://[YOUR-IP]:3000/screen/[ID]
```

### Find Your IP Address
```cmd
ipconfig
```
Look for **IPv4 Address** under your WiFi adapter (e.g. `192.168.1.100`).

---

## 🌐 Accessing the System

### Tablet Controller
Open in any browser on your laptop or tablet:
```
http://[YOUR-IP]:3000/tablet/
```

### Screen Display (for each Pi or browser tab)
```
http://[YOUR-IP]:3000/screen/A1    ← Sector A, Screen 1
http://[YOUR-IP]:3000/screen/A2    ← Sector A, Screen 2
http://[YOUR-IP]:3000/screen/B1    ← Sector B, Screen 1
```
...and so on for each sector/screen.

---

## 👤 User Roles

| Feature | Admin | Viewer |
|---------|-------|--------|
| Launch content to screens | ✅ | ✅ |
| Browse library | ✅ | ✅ |
| Upload to General session | ✅ | ✅ |
| Delete from General session | ✅ | ✅ |
| Upload to other sessions | ✅ | ❌ |
| Create/delete sessions | ✅ | ❌ |
| Add/delete sectors | ✅ | ❌ |
| Stop All Screens | ✅ | ❌ |
| Share Screen | ✅ | ✅ |

---

## 🎛️ Using the Tablet Controller

### Login
Enter your username and password on the login screen.

### Sectors Tab
- Each card shows a sector with its 2 screens
- **Tap a sector card** → opens the sector panel
- **⏹ Stop** button → clears both screens in that sector

### Sector Panel
- Shows **Screen 1** (left) — swipe left to see **Screen 2** (right)
- **Currently on screen** — live preview of what's displayed
- **Library** — tap a session name to expand its media
- Tap any image/video → launches instantly to that screen
- **Mirror toggle** → copies Screen 1 content to Screen 2
- **⬡ Share Screen** → shares your laptop screen to that screen
- **⏹ Stop** (red) → stops the screen share
- **Clear** → clears both screens

### Library Tab
- Browse all media sessions
- Search across all sessions and media
- **+ New Session** (admin only) → create a new folder
- Upload media files into any session
- Admin can delete files and sessions

### Header Buttons
- **📢 Broadcast** → send announcement text to all screens
- **★ Welcome** → launch welcome message (text or video) to all screens
- **⏹ Stop All** (admin) → clear every screen in the theater
- **Logout** → sign out

---

## 📚 Library Sessions

Sessions are folders that organize your media (images and videos).

### Default Sessions
- **General** — available to all users for upload/delete

### Create a Session (Admin)
1. Go to **Library** tab
2. Click **+ New Session**
3. Enter a name (e.g. "Gravitational Waves", "CERN")
4. Click Create

### Upload Media
1. Select a session tab
2. Click the **↑ Upload here** tile
3. Select image or video file

### Delete Media
Hover over any thumbnail → click the **✕** button

---

## 🖥️ Screen Share

Share your laptop screen to any theater screen.

1. Open a sector panel
2. Navigate to the screen you want (swipe left/right)
3. Click **⬡ Share Screen**
4. Chrome picker opens → click **Screen** tab → select **Entire Screen**
5. Click **Share**
6. Screen starts showing your laptop display
7. Click **⏹ Stop** to end

**Mirror + Share:** Turn on Mirror toggle while sharing → both screens show your laptop.

**Note:** Screen share works in Chrome/Edge on laptop only. Not supported on Android browsers.

---

## 🔊 Welcome Broadcast

Send a welcome message or video to all screens at once.

1. Click **★ Welcome** in the header
2. Choose **Text** or **Video**
   - Text: fill in Headline, Body, Eyebrow
   - Video: enter URL or pick from library
3. Click **Launch to All**

---

## 🪟 Mirror Mode

Mirror copies the content of Screen 1 to Screen 2.

- **Mirror ON** → Screen 2 gets same content as Screen 1
- **Mirror OFF** → Screen 2 is cleared
- Works with images, videos, and screen share

---

## 🔄 Auto-Shutdown

If no tablet is connected for **5 minutes**, the server shuts down automatically. Reconnecting the tablet within 5 minutes cancels the shutdown.

---

## 🍓 Raspberry Pi Setup (Theater Deployment)

### Hardware
- Raspberry Pi 4 (2 micro-HDMI ports)
- Screen 1 → micro-HDMI port 0 (closest to USB-C power)
- Screen 2 → micro-HDMI port 1
- Both screens must be connected before powering on

### Autostart Script
Create `/home/pi/start-screens.sh`:
```bash
#!/bin/bash
sleep 15

DISPLAY=:0 chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir=/tmp/screen1 \
  http://SERVER-IP:3000/screen/A1 &

sleep 3

DISPLAY=:1 chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir=/tmp/screen2 \
  http://SERVER-IP:3000/screen/A2 &
```

Make executable:
```bash
chmod +x /home/pi/start-screens.sh
```

Add to autostart:
```bash
mkdir -p /home/pi/.config/autostart
nano /home/pi/.config/autostart/theater-screens.desktop
```

Paste:
```
[Desktop Entry]
Type=Application
Name=Theater Screens
Exec=/home/pi/start-screens.sh
```

### WiFi Setup
- Use your own router (NOT university WiFi — it blocks device communication)
- Security: **WPA2**
- Make sure **client isolation is OFF**
- Connect all devices (server laptop, tablet, Pis) to the same router

---

## 📱 Android App

The Android app is a WebView wrapper for the tablet controller.

### Install
1. Copy `app-debug.apk` to your Android tablet
2. Settings → Security → Allow unknown sources
3. Open the APK → Install

### First Launch
1. Enter server IP (e.g. `192.168.1.100`)
2. Enter port (`3000`)
3. Tap Connect

### Change Server IP
Long-press anywhere in the app → tap Yes → enter new IP.

### App Updates
You do **not** need to reinstall the app when the system is updated. The app loads the tablet UI from the server every time — it updates automatically.

---

## 🎬 Video Format Recommendations

For smooth playback without lag:
- ✅ **H.264 MP4** — best compatibility, hardware decoded
- ❌ H.265/HEVC — software decoded, may lag
- ❌ MOV, MKV, AVI — convert first

**Convert videos with HandBrake:**
1. Download HandBrake (free)
2. Open your video
3. Select preset: **Fast 1080p30**
4. Output format: MP4
5. Click Start Encode

---

## ⚙️ Network Architecture

```
[Tablet/Laptop]
      │
      │ WebSocket (TCP) — control commands
      ▼
[Node.js Server :3000]
      │
      │ WebSocket (TCP) — content relay
      ▼
[Raspberry Pi Screens]
      
[Tablet] ──── Binary WebSocket ──── [Server] ──── Binary WebSocket ──── [Screen]
              (Screen Share JPEG frames)
```

---

## 🛠️ Troubleshooting

### Server won't start
- Use **CMD** not PowerShell
- Run `npm install` first
- Check Node.js version: `node --version` (needs v18+)

### Tablet can't connect
- Make sure server is running
- Check IP address with `ipconfig`
- All devices must be on the same WiFi network
- Refresh browser with `Ctrl+Shift+R`

### Screen shows nothing
- Check screen URL is correct (`/screen/A1` not `/screen/a1`)
- Refresh the screen tab
- Check server is running

### Library won't load
- Log out and log back in
- Check server is running

### Share screen is black
- Select **Entire Screen** in the picker (not a window or tab)
- Use Chrome or Edge (not Firefox)
- Screen share only works from laptop/desktop

### Video lags
- Convert video to H.264 MP4 using HandBrake
- Video plays smoothly after first load (browser caches it)

---

## 📋 Quick Reference

| Action | How |
|--------|-----|
| Start server | `cd server && node server.js` |
| Open tablet | `http://[IP]:3000/tablet/` |
| Open screen | `http://[IP]:3000/screen/[ID]` |
| Find your IP | `ipconfig` (Windows) |
| Launch content | Tap sector → tap media in library |
| Broadcast to all | 📢 button in header |
| Share screen | Sector panel → ⬡ Share Screen |
| Stop all screens | ⏹ Stop All in header (admin) |
| Add sector | Sectors tab → + Add Sector card |
| Add session | Library tab → + New Session |

---

*Theater Control System — Built at LAPP, Annecy*
