# 🔬 Comprehensive Audio Diagnostic Guide

Since audio is still choppy after initial fixes, we need to do a deep-dive analysis to identify the root cause. I've created a complete diagnostic suite to help us pinpoint the exact issue.

---

## 🎯 What We've Set Up

### 1. **Enhanced FFmpeg Logging** ✅
The ClipForge app now logs all FFmpeg output during recording:
- Verbose logging enabled (`-loglevel verbose`)
- Real-time monitoring of audio warnings
- Captures buffer issues, drops, and discontinuities

### 2. **Minimal Test Suite** ✅
Created `test-audio-minimal.sh` - tests 6 different FFmpeg configurations to isolate the problem:
- Test 1: Absolute minimal (baseline)
- Test 2: + Wallclock timestamps
- Test 3: + Increased buffers
- Test 4: + Aresample filter
- Test 5: Different sample rate (44.1kHz)
- Test 6: Control (no wallclock)

### 3. **Audio Analysis Tool** ✅
Created `analyze-audio.sh` - analyzes recorded files for:
- Packet timestamp discontinuities
- Audio level issues
- Missing packets
- Silence detection

---

## 📋 Diagnostic Workflow

Follow these steps in order:

### **Phase 1: Run Minimal Test Suite** (Most Important!)

This will tell us which parameter is causing the issue.

```bash
cd ~/Desktop/Gauntlet\ Projects/ClipForge
./test-audio-minimal.sh
```

**What it does:**
1. Tests 6 different recording configurations (10 seconds each)
2. Saves all recordings to `~/Desktop/clipforge-audio-tests/`
3. Each test adds one more parameter

**Your task:**
- Speak continuously during each 10-second test
- After completion, listen to ALL 6 recordings in QuickTime
- Note which ones are choppy vs. smooth

**Report back with:**
```
Test 1 (minimal):      ☐ Choppy  ☐ Smooth
Test 2 (wallclock):    ☐ Choppy  ☐ Smooth
Test 3 (buffers):      ☐ Choppy  ☐ Smooth
Test 4 (aresample):    ☐ Choppy  ☐ Smooth
Test 5 (44.1kHz):      ☐ Choppy  ☐ Smooth
Test 6 (no wallclock): ☐ Choppy  ☐ Smooth
```

---

### **Phase 2: Analyze FFmpeg Logs from ClipForge**

Record a video in ClipForge with the enhanced logging:

1. **Start ClipForge in terminal** (so we can see logs):
   ```bash
   cd ~/Desktop/Gauntlet\ Projects/ClipForge
   npm run tauri:dev
   ```

2. **Record a 30-second video** (speak continuously)

3. **Watch the terminal output** for lines starting with `[FFmpeg Audio]`

4. **Look for these warning signs:**
   - `drop` - packets being dropped
   - `queue full` - buffer overflow
   - `buffer underrun` - buffer empty
   - `discontinuity` - timestamp gaps
   - `overrun` - too much data
   - `pts` issues - timing problems

5. **Copy any warning messages** and share them

---

### **Phase 3: Analyze a Recorded File**

Pick one choppy recording and analyze it:

```bash
./analyze-audio.sh ~/path/to/your/recording.mp4
```

This will show:
- Audio stream details (codec, bitrate, sample rate)
- Timestamp gaps (if any)
- Packet count vs. expected
- Audio level issues

**Share the output** from this analysis.

---

## 🔍 What We're Looking For

### Scenario A: All Tests Are Choppy
**Diagnosis**: Fundamental audio device or driver issue
**Likely causes**:
- Audio device configuration problem
- macOS audio system issue
- Hardware problem

**Next steps**:
- Test with different audio input device
- Check System Preferences → Sound → Input
- Restart Core Audio: `sudo killall coreaudiod`
- Check Console app for system audio errors

---

### Scenario B: Only Tests with Wallclock Are Choppy
**Diagnosis**: `-use_wallclock_as_timestamps` parameter is the culprit
**Likely cause**:
- Audio device clock drift
- Wallclock and device clock mismatch

**Next steps**:
- Remove wallclock parameter
- Use device timestamps instead
- Add manual timing correction

---

### Scenario C: Only Tests with Aresample Are Choppy
**Diagnosis**: `aresample` filter causing issues
**Likely cause**:
- Resampling overhead
- Filter configuration problem

**Next steps**:
- Remove aresample filter
- Try different sync method
- Use simpler audio processing

---

### Scenario D: FFmpeg Logs Show Buffer Issues
**Diagnosis**: Buffer configuration problem
**Likely cause**:
- Buffers too small or too large
- Thread queue configuration
- CPU not keeping up

**Next steps**:
- Adjust buffer sizes
- Reduce encoding complexity
- Check CPU usage during recording

---

### Scenario E: Analysis Shows Timestamp Gaps
**Diagnosis**: Packet capture timing problem
**Likely cause**:
- Device driver issues
- macOS audio capture timing
- Input device buffering

**Next steps**:
- Use different capture method
- Adjust audio device buffer size
- Test with different audio API

---

## 🎧 Quick Audio Device Check

Before running tests, verify your audio setup:

### List Available Devices
```bash
ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -A 20 "audio devices"
```

### Check System Audio Settings
1. System Preferences → Sound → Input
2. Select your microphone
3. Verify input level meter moves when you speak
4. Check "Use ambient noise reduction" is OFF (can cause issues)

### Test with System Built-in Mic
If using external mic/interface, try the built-in Mac microphone as a control test.

---

## 📊 Expected Results & Interpretations

### If Test 1 (Minimal) is Smooth:
✅ **Good news!** FFmpeg can capture audio properly. The issue is with our added parameters.

→ Run Phase 1 tests and identify which parameter introduces choppiness

### If Test 1 (Minimal) is Choppy:
⚠️ **Fundamental issue** with audio capture on your system.

Possible causes:
1. **Audio device problem**: Try different mic
2. **Sample rate mismatch**: Your device might not support 48kHz
3. **Driver issue**: Check for macOS updates
4. **Core Audio issue**: Restart `coreaudiod`

### If ALL Tests Are Choppy:
❌ **System-level audio problem**, not FFmpeg configuration.

Actions:
1. Check Activity Monitor → CPU usage during recording
2. Check Console app for audio system errors
3. Test with QuickTime's built-in recorder (as control)
4. Check if other recording apps (Audacity, etc.) have same issue

---

## 🚀 Quick Start: Run Phase 1 Now

The most important diagnostic is the minimal test suite:

```bash
cd ~/Desktop/Gauntlet\ Projects/ClipForge
./test-audio-minimal.sh
```

**This will take ~2 minutes total** (6 tests × 10 seconds + gaps)

**Then:**
1. Open `~/Desktop/clipforge-audio-tests/` in Finder
2. Play each MP4 file in QuickTime
3. Note which are choppy
4. Report back with results

---

## 📝 Reporting Template

When you run the diagnostics, report back with this info:

```
=== PHASE 1: MINIMAL TEST RESULTS ===
Test 1 (minimal):      [ Choppy / Smooth ]
Test 2 (wallclock):    [ Choppy / Smooth ]
Test 3 (buffers):      [ Choppy / Smooth ]
Test 4 (aresample):    [ Choppy / Smooth ]
Test 5 (44.1kHz):      [ Choppy / Smooth ]
Test 6 (no wallclock): [ Choppy / Smooth ]

=== PHASE 2: FFMPEG LOGS ===
(Paste any [FFmpeg Audio] warning lines here)

=== PHASE 3: FILE ANALYSIS ===
(Paste output from analyze-audio.sh here)

=== SYSTEM INFO ===
Audio input device: (e.g., "Built-in Microphone", "USB Audio Device")
macOS version: (e.g., "Sonoma 14.5")
CPU usage during recording: (check Activity Monitor)
Other apps running: (especially audio apps)
```

---

## 💡 Pro Tips

1. **Close other audio apps** during testing (Zoom, Spotify, etc.)
2. **Monitor CPU usage** in Activity Monitor while recording
3. **Check Console app** (Applications → Utilities → Console) for system audio errors
4. **Test built-in mic first** before external audio interfaces
5. **Record in a quiet room** so you can clearly hear choppiness vs. background noise

---

## 🔧 Quick Fixes to Try First

Before running full diagnostics, try these quick wins:

### Fix 1: Restart Core Audio
```bash
sudo killall coreaudiod
```

### Fix 2: Check Audio MIDI Setup
1. Open "Audio MIDI Setup" app (Spotlight → "Audio MIDI")
2. Select your microphone
3. Check sample rate is set to 48000 Hz
4. If not, change it to 48000 Hz

### Fix 3: Test with Built-in Mic
Switch to Mac's built-in microphone and test if issue persists.

### Fix 4: Disable Ambient Noise Reduction
System Preferences → Sound → Input → Uncheck "Use ambient noise reduction"

---

## 🎯 What Happens Next

Based on your diagnostic results, I'll:

1. **Identify the exact problematic parameter**
2. **Remove or replace it** with a working alternative
3. **Test the fix** is targeted and minimal
4. **Ensure sync is maintained** while fixing audio quality

The minimal test suite (Phase 1) is the most critical - it will tell us exactly which parameter is causing the choppy audio.

---

**Ready to run diagnostics?** Start with Phase 1:

```bash
cd ~/Desktop/Gauntlet\ Projects/ClipForge
./test-audio-minimal.sh
```

Then report back with which tests are choppy vs. smooth! 🔬
