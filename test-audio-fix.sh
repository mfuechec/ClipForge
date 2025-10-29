#!/bin/bash

# Quick Test: Verify Audio Fix
# Tests the new configuration (no wallclock + simple asetpts)

echo "🎙️ Testing Audio Fix"
echo "===================="
echo ""
echo "This will record a 15-second test with the NEW configuration"
echo "(No wallclock timestamps + simplified audio filters)"
echo ""
echo "Please speak or make noise during the recording..."
echo ""

OUTDIR="$HOME/Desktop/clipforge-audio-fix-test"
mkdir -p "$OUTDIR"

DURATION=15
MIC_DEVICE="0"

# Test with new configuration (matches what we just implemented)
echo "Recording 15 seconds with FIXED configuration..."
echo "(No wallclock + asetpts timestamp normalization)"
sleep 2

ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/fixed-audio.mp4" 2>&1 | tee "$OUTDIR/test.log"

echo ""
echo "✅ Recording complete!"
echo ""
echo "=========================================="
echo "📊 AUDIO ANALYSIS"
echo "=========================================="
echo ""

ffprobe -v error -select_streams a:0 \
    -show_entries stream=codec_name,sample_rate,channels,duration,bit_rate \
    -of default=noprint_wrappers=1 "$OUTDIR/fixed-audio.mp4"

echo ""
echo "=========================================="
echo "🎧 LISTEN TO THE RECORDING"
echo "=========================================="
echo ""
echo "File: $OUTDIR/fixed-audio.mp4"
echo ""
echo "Is the audio smooth and clear? (no choppiness/crackling)"
echo ""
echo "If YES → Fix is working! 🎉"
echo "If NO → May need additional adjustments"
echo ""

# Open the file for listening
open "$OUTDIR/fixed-audio.mp4"
