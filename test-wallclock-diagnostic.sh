#!/bin/bash

# Automated Wallclock Diagnostic Test
# Tests if wallclock timestamps cause audio issues
# Uses sine wave tone to avoid needing user speech

echo "🔬 Automated Wallclock Diagnostic Test"
echo "======================================="
echo ""
echo "Testing two configurations:"
echo "  1. WITHOUT wallclock (device timestamps)"
echo "  2. WITH wallclock (system timestamps)"
echo ""

OUTDIR="$HOME/Desktop/clipforge-wallclock-test"
mkdir -p "$OUTDIR"

DURATION=10
MIC_DEVICE="0"  # Built-in microphone

# Test 1: Without wallclock (device timestamps - should be smooth)
echo "Test 1: Recording WITHOUT wallclock timestamps..."
ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -y "$OUTDIR/no-wallclock.mp4" 2>&1 | tee "$OUTDIR/no-wallclock.log"

echo "✅ Test 1 complete"
echo ""

# Test 2: With wallclock (current ClipForge - may be choppy)
echo "Test 2: Recording WITH wallclock timestamps..."
ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -use_wallclock_as_timestamps 1 \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -y "$OUTDIR/with-wallclock.mp4" 2>&1 | tee "$OUTDIR/with-wallclock.log"

echo "✅ Test 2 complete"
echo ""

# Analyze the recordings
echo "=========================================="
echo "📊 ANALYSIS"
echo "=========================================="
echo ""

echo "File sizes:"
ls -lh "$OUTDIR"/*.mp4 | awk '{print $9, $5}'
echo ""

echo "Audio stream info:"
echo ""
echo "--- WITHOUT wallclock ---"
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels,duration -of default=noprint_wrappers=1 "$OUTDIR/no-wallclock.mp4"
echo ""
echo "--- WITH wallclock ---"
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels,duration -of default=noprint_wrappers=1 "$OUTDIR/with-wallclock.mp4"
echo ""

echo "=========================================="
echo "🎯 TEST COMPLETE!"
echo "=========================================="
echo ""
echo "📁 Files saved to: $OUTDIR"
echo ""
echo "🎧 NOW LISTEN TO BOTH FILES:"
echo "   1. Open $OUTDIR in Finder"
echo "   2. Play no-wallclock.mp4"
echo "   3. Play with-wallclock.mp4"
echo "   4. Compare audio quality (choppy vs smooth)"
echo ""
echo "💡 If WITH-wallclock sounds choppy/crackly,"
echo "   then wallclock IS the problem!"
echo ""

# Open the folder automatically
open "$OUTDIR"
