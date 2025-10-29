#!/bin/bash

# Mono vs Stereo Crackling Test
# Tests if forcing stereo on mono hardware causes crackling

echo "🎙️ Mono vs Stereo Crackling Test"
echo "=================================="
echo ""
echo "Your hardware is MONO but ClipForge forces STEREO."
echo "This might be causing the crackling!"
echo ""
echo "This will record 3 tests (12 seconds each):"
echo "  1. Native MONO (let hardware decide)"
echo "  2. Forced STEREO (current ClipForge config)"
echo "  3. MONO with explicit format"
echo ""
echo "Speak continuously during each test!"
echo ""
echo "Press Enter to start..."
read

OUTDIR="$HOME/Desktop/clipforge-mono-stereo-test"
mkdir -p "$OUTDIR"

DURATION=12
MIC_DEVICE="0"

# Test 1: Native mono (no channel forcing)
echo ""
echo "======================================"
echo "TEST 1: Native MONO (Hardware Native)"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test1-mono-native.mp4" 2>&1 | tee "$OUTDIR/test1.log"

echo "✅ Test 1 complete"
sleep 1

# Test 2: Forced stereo (current ClipForge)
echo ""
echo "======================================"
echo "TEST 2: Forced STEREO (Current Config)"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test2-stereo-forced.mp4" 2>&1 | tee "$OUTDIR/test2.log"

echo "✅ Test 2 complete"
sleep 1

# Test 3: Explicit mono with format specification
echo ""
echo "======================================"
echo "TEST 3: MONO with Explicit Format"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -audio_buffer_size 4096 \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 1 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test3-mono-explicit.mp4" 2>&1 | tee "$OUTDIR/test3.log"

echo "✅ Test 3 complete"

# Analyze all recordings
echo ""
echo "=========================================="
echo "📊 ANALYSIS"
echo "=========================================="
echo ""

for i in 1 2 3; do
    echo "--- Test $i ---"
    ffprobe -v error -select_streams a:0 \
        -show_entries stream=sample_rate,channels,codec_name,channel_layout \
        -of default=noprint_wrappers=1 "$OUTDIR/test${i}-"*.mp4 2>/dev/null

    echo "File size: $(ls -lh "$OUTDIR/test${i}-"*.mp4 2>/dev/null | awk '{print $5}')"
    echo ""
done

echo "=========================================="
echo "🎧 LISTENING TEST RESULTS"
echo "=========================================="
echo ""
echo "Files saved to: $OUTDIR"
echo ""
echo "Listen to each file:"
echo ""
echo "  1. test1-mono-native.mp4         (Auto mono)"
echo "  2. test2-stereo-forced.mp4       (Forced stereo - current)"
echo "  3. test3-mono-explicit.mp4       (Explicit mono)"
echo ""
echo "Rate the crackling:"
echo ""
echo "Test 1 (Mono native):      ☐ No crackling  ☐ Light  ☐ Heavy"
echo "Test 2 (Stereo forced):    ☐ No crackling  ☐ Light  ☐ Heavy"
echo "Test 3 (Mono explicit):    ☐ No crackling  ☐ Light  ☐ Heavy"
echo ""
echo "💡 EXPECTED RESULT:"
echo "   If Test 1 or 3 (mono) sounds better than Test 2 (stereo),"
echo "   then forcing stereo is causing the crackling!"
echo ""
echo "Which test has the LEAST crackling?"
echo ""

# Open the folder
open "$OUTDIR"
