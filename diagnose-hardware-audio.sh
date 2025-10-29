#!/bin/bash

# Diagnose Hardware Audio Configuration
# Determines the native sample rate and format of the audio device

echo "🔍 Hardware Audio Diagnostics"
echo "=============================="
echo ""

# List available audio devices with details
echo "📋 Available Audio Devices:"
echo "----------------------------"
ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -A 20 "AVFoundation audio devices"
echo ""

# Get the default microphone (device 0)
MIC_DEVICE="0"

echo "🎙️ Querying Hardware Configuration for Device :${MIC_DEVICE}"
echo "--------------------------------------------------------------"
echo ""

# Query device using very short capture (1 second) to see what format FFmpeg detects
echo "Capturing 1-second sample to detect native format..."
echo ""

ffmpeg -f avfoundation -i ":${MIC_DEVICE}" -t 1 -f null - 2>&1 | tee /tmp/audio_probe.log

echo ""
echo "=========================================="
echo "📊 DETECTED AUDIO CONFIGURATION"
echo "=========================================="
echo ""

# Extract key information
DETECTED_RATE=$(grep -o 'Stream.*Audio.*[0-9]* Hz' /tmp/audio_probe.log | grep -o '[0-9]* Hz' | head -1)
DETECTED_CHANNELS=$(grep -o 'Stream.*Audio.*stereo\|mono' /tmp/audio_probe.log | head -1)
DETECTED_FORMAT=$(grep -o 'Stream.*Audio.*pcm_[a-z0-9]*' /tmp/audio_probe.log | grep -o 'pcm_[a-z0-9]*' | head -1)

echo "Native Sample Rate:  $DETECTED_RATE"
echo "Native Channels:     $DETECTED_CHANNELS"
echo "Native Format:       $DETECTED_FORMAT"
echo ""

# Check macOS Audio MIDI Setup configuration
echo "=========================================="
echo "🎛️ macOS Audio MIDI Configuration"
echo "=========================================="
echo ""
echo "Checking system audio configuration..."
echo "(This shows what macOS thinks the device should use)"
echo ""

# Use system_profiler to get audio hardware info
system_profiler SPAudioDataType 2>/dev/null | grep -A 10 "Input Device"

echo ""
echo "=========================================="
echo "💡 RECOMMENDATIONS"
echo "=========================================="
echo ""

# Parse the detected rate
RATE_NUMBER=$(echo "$DETECTED_RATE" | grep -o '[0-9]*')

if [ "$RATE_NUMBER" = "44100" ]; then
    echo "✅ Your hardware samples at 44.1kHz (CD quality)"
    echo ""
    echo "ISSUE FOUND:"
    echo "  ClipForge is currently set to 48kHz, but your hardware is 44.1kHz!"
    echo "  This mismatch causes crackling during resampling."
    echo ""
    echo "FIX:"
    echo "  Change ClipForge to use 44100 Hz instead of 48000 Hz"
    echo "  Location: src-tauri/src/lib.rs (lines 1119, 1125)"
    echo ""
elif [ "$RATE_NUMBER" = "48000" ]; then
    echo "✅ Your hardware samples at 48kHz (professional quality)"
    echo ""
    echo "GOOD NEWS:"
    echo "  ClipForge is already set to 48kHz, matching your hardware."
    echo "  Sample rate is NOT the issue."
    echo ""
    echo "NEXT STEPS:"
    echo "  1. Check Audio MIDI Setup app for sample rate overrides"
    echo "  2. Test with different buffer sizes"
    echo "  3. Check for USB audio interface issues"
    echo ""
else
    echo "⚠️ Unusual sample rate detected: $DETECTED_RATE"
    echo ""
    echo "ClipForge should use: $RATE_NUMBER Hz"
    echo ""
fi

echo "=========================================="
echo "🧪 NEXT DIAGNOSTIC STEP"
echo "=========================================="
echo ""
echo "Run this command to test both 44.1kHz and 48kHz:"
echo ""
echo "  ./test-sample-rates.sh"
echo ""
echo "This will record short samples at different rates"
echo "so you can hear which one has less crackling."
echo ""
