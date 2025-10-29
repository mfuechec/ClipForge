# 🔬 Audio/Video Sync Diagnostic Guide

This guide will help you diagnose and measure audio/video synchronization issues in ClipForge.

## 🎯 Quick Start

### Step 1: Enable Diagnostics Mode

Add the diagnostic panel to your app:

```jsx
// src/App.jsx (or your main component)
import SyncDiagnosticsPanel from './components/SyncDiagnosticsPanel';

function App() {
  return (
    <div>
      {/* Your existing components */}

      {/* Add diagnostic panel - only shows in development */}
      {import.meta.env.DEV && <SyncDiagnosticsPanel />}
    </div>
  );
}
```

### Step 2: Enable VideoPlayer Diagnostics

Update your VideoPlayer component to enable diagnostics:

```jsx
<VideoPlayer
  videoPath={currentVideo}
  onTimeUpdate={handleTimeUpdate}
  // ... other props ...
  enableDiagnostics={import.meta.env.DEV}  // Add this line
/>
```

### Step 3: Run the Diagnostic Tests

1. **Start your app**: `npm run tauri:dev`
2. **Load a video** in the player
3. **Click the "🔬 Sync Diagnostics" button** in the bottom-right corner
4. **Run tests**:
   - **Single test**: Set duration (10s recommended) and playback rate, click "▶️ Start Test"
   - **Full suite**: Click "🚀 Run Full Suite" to test at 1x, 1.5x, and 2x speeds

---

## 📊 Understanding the Results

### Drift Analysis

**Drift** measures how much audio and video diverge over time, measured in **milliseconds of drift per second of playback**.

| Drift Value | Interpretation | Action Needed |
|-------------|----------------|---------------|
| **< 1 ms/s** | ✅ Excellent sync | None - working perfectly |
| **1-10 ms/s** | ⚠️ Noticeable after 10+ seconds | Consider fixing if users notice |
| **10-50 ms/s** | ⚠️ Obvious desync | Fix recommended |
| **> 50 ms/s** | ❌ Critical failure | Immediate fix required |

**Positive drift** = Video ahead of audio (audio lags behind)
**Negative drift** = Audio ahead of video (video lags behind)

### Example Interpretations

#### ✅ Good Result (Native Audio)
```
Average Drift: 0.523 ms/s (Excellent)
Playback Rate: 1.5x

INTERPRETATION:
  • Web Audio API is NOT active - using native HTML5 audio
  • Native audio should sync automatically with playbackRate
  • Sync is excellent - no action needed
```

This indicates your audio is playing natively (not routed through Web Audio API), and sync is working perfectly.

---

#### ❌ Problem Result (Web Audio + Variable Playback)
```
Average Drift: 127.45 ms/s (CRITICAL)
Playback Rate: 1.5x

INTERPRETATION:
  • Web Audio API is ACTIVE - audio routed through AudioContext
  • Playback rate is 1.5x (not 1x)
  • Web Audio API does NOT respect video playbackRate!
  • Expected behavior: Audio plays at 1x while video plays at 1.5x
  • SOLUTION: Switch to native HTML5 audio
```

This confirms the Web Audio API playback rate bug. Audio stays at 1x while video accelerates.

**Expected drift calculation**:
- At 1.5x playback for 10 seconds
- Video advances: 15 seconds
- Audio advances: 10 seconds
- Drift: 5 seconds / 10 seconds = **500 ms/s** ✅ Matches theory

---

#### ⚠️ Recording Issue
```
Average Drift: 15.23 ms/s (Noticeable)
Playback Rate: 1.0x

INTERPRETATION:
  • Drift detected even at 1x speed
  • Possible causes: Recording sync issue, buffer underruns
```

If drift occurs **even at 1x playback**, the problem is in the **recording**, not playback. This suggests:
- FFmpeg audio/video stream sync issues
- Insufficient thread queue buffers
- Frame drops during recording
- Audio device timing issues

**Solution**: Increase FFmpeg `thread_queue_size` from 512 to 2048.

---

## 🧪 Recommended Test Protocol

### Test 1: Baseline (1x Speed)
**Purpose**: Verify recording quality

1. Load a recorded video
2. Set playback rate to **1.0x**
3. Run 10-second test
4. **Expected result**: < 5 ms/s drift

**If drift > 5 ms/s at 1x**: Recording has sync issues. Fix FFmpeg parameters.

---

### Test 2: Playback Rate Scaling (1.5x Speed)
**Purpose**: Identify Web Audio API playback rate bug

1. Same video as Test 1
2. Set playback rate to **1.5x**
3. Run 10-second test
4. **Expected results**:
   - **With Web Audio API**: ~500 ms/s drift (BAD)
   - **With native audio**: < 5 ms/s drift (GOOD)

**If drift jumps to ~500 ms/s**: Web Audio API is preventing audio from scaling with video. Remove Web Audio routing.

---

### Test 3: High Speed (2x Speed)
**Purpose**: Stress test sync mechanism

1. Same video
2. Set playback rate to **2.0x**
3. Run 10-second test
4. **Expected results**:
   - **With Web Audio API**: ~1000 ms/s drift (BAD)
   - **With native audio**: < 10 ms/s drift (GOOD)

---

### Test 4: Full Suite
Click "🚀 Run Full Suite" to automatically run Tests 1-3 and compare results.

---

## 🔍 Manual Testing (Without UI)

You can also run diagnostics from the browser console:

### Open DevTools
1. Run app in dev mode
2. Press `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
3. Go to Console tab

### Run Quick Test
```javascript
// 10-second test at 1.5x speed
runSyncTest(10, 1.5);
```

### Export Data
```javascript
// After test completes
window.__lastSyncDiagnostics.exportMeasurements();
```

This downloads a CSV with frame-by-frame timing data for Excel/Python analysis.

---

## 🎬 Creating Sync Test Recordings

To create videos optimized for sync testing:

### Method 1: Screen + Audio Recording
1. Open a YouTube video with clear audio beats (e.g., metronome)
2. Display a stopwatch/timer on screen
3. Record both screen and system audio
4. Playback and check if audio beats align with visual timer

### Method 2: Clapper Board Technique
1. Record yourself clapping on camera with microphone
2. The visual hand clap should align with the audio waveform
3. Playback at 1x, 1.5x, 2x and verify sync
4. Measure frame offset between visual and audio clap

### Method 3: Automated Sync Pattern
Create a test video with alternating beeps and flashes:

```javascript
// Use this FFmpeg command to generate sync test pattern
ffmpeg -f lavfi -i testsrc=duration=30:size=1280x720:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=30:sample_rate=48000 \
       -filter_complex "[0:v]drawtext=text='%{pts\:hms}':fontsize=72:x=(w-tw)/2:y=(h-th)/2:fontcolor=white[v]" \
       -map "[v]" -map 1:a \
       sync-test-pattern.mp4
```

This creates a 30-second video with:
- Visual timecode overlay
- 1kHz audio tone
- Easy to verify sync by comparing audio waveform to visual time

---

## 📈 Advanced Analysis

### CSV Export Fields

| Field | Description |
|-------|-------------|
| `perfNow` | JavaScript timestamp (performance.now) |
| `videoTime` | Video element currentTime |
| `audioContextTime` | AudioContext.currentTime (if Web Audio active) |
| `videoPlaybackRate` | Current playback speed |
| `drift` | ms of audio/video divergence per second |
| `progressError` | Difference between expected and actual video progress |

### Python Analysis Script

```python
import pandas as pd
import matplotlib.pyplot as plt

# Load exported CSV
df = pd.read_csv('sync-diagnostics-*.csv')

# Plot drift over time
plt.figure(figsize=(12, 6))
plt.plot(df['perfElapsed'] / 1000, df['drift'])
plt.xlabel('Time (seconds)')
plt.ylabel('Drift (ms/s)')
plt.title('Audio/Video Sync Drift Over Time')
plt.axhline(y=0, color='r', linestyle='--', alpha=0.5)
plt.grid(True, alpha=0.3)
plt.show()

# Calculate statistics
print(f"Average drift: {df['drift'].mean():.2f} ms/s")
print(f"Max drift: {df['drift'].max():.2f} ms/s")
print(f"Std deviation: {df['drift'].std():.2f} ms/s")
```

---

## ✅ Diagnostic Checklist

Use this checklist to systematically diagnose your sync issue:

- [ ] **Enable diagnostic mode** on VideoPlayer component
- [ ] **Load a test video** (at least 30 seconds long)
- [ ] **Run baseline test** at 1.0x speed
  - [ ] Drift < 5 ms/s? → Recording OK
  - [ ] Drift > 5 ms/s? → Fix FFmpeg recording (increase thread_queue_size)
- [ ] **Run playback rate test** at 1.5x speed
  - [ ] Drift < 10 ms/s? → Playback OK
  - [ ] Drift > 100 ms/s? → Web Audio API bug (remove routing)
- [ ] **Run full suite** to compare all speeds
- [ ] **Export CSV data** for detailed analysis
- [ ] **Create visual sync test** (clapper board or test pattern)
- [ ] **Verify fix** by re-running full suite

---

## 🚀 Next Steps Based on Results

### If Drift at 1x Speed Only
**Problem**: Recording sync issue
**Solution**: Edit `src-tauri/src/lib.rs`:
```rust
// Increase thread queue size (lines 864, 872, 890, 895)
.arg("-thread_queue_size").arg("2048")  // was 512
```

### If Drift at >1x Speed Only
**Problem**: Web Audio API doesn't scale with playback rate
**Solution**: Refactor VideoPlayer to use native audio (see Option 1 in architecture recommendations)

### If Drift at All Speeds
**Problem**: Multiple issues (recording + playback)
**Solution**: Fix both FFmpeg parameters AND switch to native audio

---

## 💡 Pro Tips

1. **Always test at 1x first** - establishes baseline
2. **Test with 30+ second videos** - short clips hide drift
3. **Use actual recorded content** - test patterns may not expose real-world issues
4. **Export CSV for trends** - single numbers can be misleading
5. **Test on target hardware** - performance varies by CPU/GPU
6. **Compare multiple recordings** - identify if specific modes (combo/screen/webcam) have worse sync

---

## 📞 Reporting Issues

When reporting sync issues, include:

1. **Full diagnostic report** (copy from diagnostic panel)
2. **CSV export** (if drift > 10 ms/s)
3. **Recording mode** (screen/webcam/combo)
4. **Recording duration** and file size
5. **Playback rate** when issue occurs
6. **System info** (OS, CPU, available RAM)

---

## 🎓 Technical Deep Dive

### Why Web Audio API Breaks Playback Rate

When you route video audio through Web Audio API:

```javascript
const source = audioContext.createMediaElementSource(videoElement);
source.connect(audioContext.destination);
```

The browser decouples the `<video>` element's audio rendering from its native pipeline. The `playbackRate` property now only affects the **video frame decoder**, not the **audio stream**. The AudioContext renders audio at its fixed sample rate (48kHz) using its own clock (`AudioContext.currentTime`), completely independent of `HTMLMediaElement.currentTime`.

**Timeline desync example at 1.5x**:
- t=0: Video 0s, Audio 0s ✅
- t=10s real: Video 15s, Audio 10s ❌ (5s gap)
- t=20s real: Video 30s, Audio 20s ❌ (10s gap)

### Why Native Audio Works

Without Web Audio API routing, the browser uses a single clock for video and audio streams:

```javascript
// Native behavior - single timeline
videoElement.playbackRate = 1.5;
// Both video AND audio decode at 1.5x speed
```

The browser's media pipeline time-stretches the audio using its built-in resampling algorithms (libspeex, SoundTouch, etc.), keeping perfect sync.

---

**Happy debugging!** 🐛🔍

If you have questions or need help interpreting results, include the full diagnostic report in your question.
