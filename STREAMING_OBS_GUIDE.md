# OBS Studio & 24/7 Livestreaming Setup Guide
**Project:** Country Flag Battle Arena  
**Hardware Target:** Intel Core i3-10100 | Intel UHD Graphics 630 | Ubuntu 26.04.1 LTS  
**Bandwidth Budget:** 10–20 Mbps Upload  

---

## 1. Intel UHD 630 Hardware Acceleration Audit

The system driver audit confirmed that the Intel iHD media driver and VAAPI are available:
- **Driver:** Intel iHD driver for Intel Gen Graphics (`26.1.2`)
- **VAAPI Version:** 1.23 (libva 2.22.0)
- **Supported H.264 Profiles:** `VAProfileH264Main`, `VAProfileH264High`, `VAProfileH264ConstrainedBaseline`
- **Supported Entrypoints:** `VAEntrypointEncSlice`, `VAEntrypointEncSliceLP` (Low Power)
- **Available Hardware Encoders in FFmpeg:** `h264_vaapi`, `h264_qsv`

### User Permissions for Hardware Video Acceleration
To allow OBS Studio or FFmpeg to access `/dev/dri/renderD128` without root privileges, ensure your user is in the `render` and `video` groups:
```bash
sudo usermod -a -G render,video $USER
```
*(Log out and log back in for group changes to take effect).*

---

## 2. OBS Studio Configuration (Recommended)

### A. Video Settings
- **Base (Canvas) Resolution:** `1280x720`
- **Output (Scaled) Resolution:** `1280x720`
- **Downscale Filter:** Bicubic or Lanczos (none required if Base == Output)
- **Common FPS Values:** `30` (Optimal for 24/7 stream stability on i3-10100)

### B. Output Settings (Advanced Mode)
- **Streaming Tab:**
  - **Encoder:** `FFmpeg VAAPI` (or `Intel QuickSync (QSV)`)
  - **Profile:** `high`
  - **Bitrate:** `2800 Kbps` (CBR)
  - **Keyframe Interval:** `2` seconds
  - **Preset:** `balanced` (or `quality`)
  - **Rate Control:** `CBR`

### C. CPU Fallback Configuration (if VAAPI is disabled)
- **Encoder:** `x264`
- **Rate Control:** `CBR`
- **Bitrate:** `2500–2800 Kbps`
- **Keyframe Interval:** `2` seconds
- **CPU Usage Preset:** `veryfast` or `superfast` (leaves 70%+ CPU free for the game and OS)
- **Profile:** `main`
- **Tune:** `zerolatency`

### D. Audio Settings
- **Audio Bitrate:** `128 Kbps`
- **Channels:** Stereo
- **Sample Rate:** `44.1 kHz` or `48 kHz`

---

## 3. Adding the Arena Source to OBS

### Option 1: Browser Source (Cleanest & Recommended)
1. In OBS Studio, click **+** under **Sources** and select **Browser**.
2. Set **URL** to either game in direct broadcast mode:
   - **Country Battle Arena (Battle Royale):**
     ```
     http://127.0.0.1:3000/?game=battle&broadcast=true
     ```
   - **Country Eliminate Arena (Rotating Gap Survival):**
     ```
     http://127.0.0.1:3000/?game=eliminate&broadcast=true
     ```
   - **Country Line Battle Arena (Line Tether & Cutting Survival):**
     ```
     http://127.0.0.1:3000/?game=line&broadcast=true
     ```
   - **Unified Selection Dashboard:**
     ```
     http://127.0.0.1:3000/
     ```
3. Set **Width:** `1280`
4. Set **Height:** `720`
5. Check **Shutdown source when not visible** (Leave UNCHECKED for continuous 24/7 streams).
6. Check **Refresh browser when scene becomes active**.
7. Click **OK**.

### Option 2: Window Capture (Xcomposite / Wayland)
1. Start your local browser (Chromium or Firefox) in dedicated app mode:
   ```bash
   chromium-browser --app="http://127.0.0.1:3000/?broadcast=true" --window-size=1280,720
   ```
2. In OBS, add a **Window Capture** source and select the Country Battle Arena window.

---

## 4. Multi-Streaming (YouTube + Facebook)

With an upload bandwidth of 10–20 Mbps:
- One 720p 30fps stream at 2800 Kbps video + 128 Kbps audio consumes **~3.0 Mbps**.
- Running two simultaneous independent encoder pipelines from OBS consumes **~6.0 Mbps** and doubles encoder load on the GPU/CPU.
- **Recommended Strategy:**
  1. Use an RTMP Relay (such as [Restream.io](https://restream.io) or a local NGINX RTMP server) so OBS only encodes and uploads **one single 3.0 Mbps stream**, and the relay duplicates it to both YouTube Live and Facebook Live without taxing your local network or hardware.
  2. If broadcasting directly without a relay, test your sustained upload first with `speedtest-cli` to ensure at least 8 Mbps upload is constantly available.
