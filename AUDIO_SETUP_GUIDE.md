# System Audio Setup Guide for ClipForge

## Step 1: Install BlackHole (Already Done ✅)

You've installed BlackHole 2ch via Homebrew.

## Step 2: Configure macOS Audio Routing

### Create Multi-Output Device:

1. **Open Audio MIDI Setup**
   - Press `Cmd + Space` and search for "Audio MIDI Setup"
   - Or go to: Applications → Utilities → Audio MIDI Setup

2. **Create Multi-Output Device**
   - Click the **+** button (bottom left)
   - Select **"Create Multi-Output Device"**

3. **Configure the Multi-Output**
   - Check both:
     - ✅ Your speakers/headphones (MacBook Pro Speakers or whatever you use)
     - ✅ BlackHole 2ch
   - This allows you to HEAR audio while recording it

4. **Set as System Output** (Important!)
   - Right-click the Multi-Output Device
   - Select **"Use This Device For Sound Output"**
   - Or: System Settings → Sound → Output → Select "Multi-Output Device"

### Create Aggregate Device (For Advanced Mixing):

1. **Create Aggregate Device**
   - Click the **+** button again
   - Select **"Create Aggregate Device"**

2. **Configure the Aggregate**
   - Check:
     - ✅ Your microphone (for voice input)
     - ✅ BlackHole 2ch (for system audio capture)
   - This combines both audio sources into one virtual device

3. **Name it**: "ClipForge Audio Input"

## Step 3: Test in ClipForge

1. **Restart ClipForge** (so it detects new devices)
2. **Click Record → Select Mode**
3. **In Audio Settings Modal:**
   - **Microphone**: Select your actual mic
   - **System Audio**: Select "BlackHole 2ch" or "ClipForge Audio Input"
   - Enable both toggles
4. **Start Recording**

## Troubleshooting:

### Can't hear audio while recording?
- Make sure you're using the **Multi-Output Device** as system output
- Check that your speakers/headphones are checked in the Multi-Output

### Audio sounds weird/distorted?
- Sample rates must match (usually 48000 Hz)
- In Audio MIDI Setup, set all devices to 48000 Hz

### BlackHole not showing up?
- Reboot your Mac (required after installation)
- Check: `ls /Library/Audio/Plug-Ins/HAL/`
- Should see: BlackHole2ch.driver

## What You Can Record Now:

✅ **Microphone only** - Your voice
✅ **System audio only** - Computer sounds, music, apps
✅ **Both simultaneously** - Voiceover + app audio (perfect for tutorials)
✅ **Quality control** - Voice (64k), Standard (128k), High (256k)

---

**Questions?** Check: https://github.com/ExistentialAudio/BlackHole/wiki
