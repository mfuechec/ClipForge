#!/bin/bash

# Sample Rate Comparison Test
# Records at different sample rates to identify which eliminates crackling

echo "🎙️ Sample Rate Crackling Test"
echo "=============================="
echo ""
echo "This will record 4 short tests (10 seconds each)"
echo "to determine which sample rate eliminates crackling."
echo ""
echo "Please speak continuously during each test!"
echo ""
echo "Press Enter to start..."
read

OUTDIR="$HOME/Desktop/clipforge-sample-rate-test"
mkdir -p "$OUTDIR"

DURATION=10
MIC_DEVICE="0"

# Test 1: 44.1kHz (CD quality - may match hardware)
echo ""
echo "======================================"
echo "TEST 1: 44.1kHz (CD Quality)"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 44100 -ac 2 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test1-44100hz.mp4" 2>&1 | tee "$OUTDIR/test1.log"

echo "✅ Test 1 complete"
sleep 1

# Test 2: 48kHz (Professional quality - current ClipForge setting)
echo ""
echo "======================================"
echo "TEST 2: 48kHz (Professional)"
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
    -y "$OUTDIR/test2-48000hz.mp4" 2>&1 | tee "$OUTDIR/test2.log"

echo "✅ Test 2 complete"
sleep 1

# Test 3: Native (no resampling - let device choose)
echo ""
echo "======================================"
echo "TEST 3: Native (Device Default)"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ac 2 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test3-native.mp4" 2>&1 | tee "$OUTDIR/test3.log"

echo "✅ Test 3 complete"
sleep 1

# Test 4: 44.1kHz with larger buffers
echo ""
echo "======================================"
echo "TEST 4: 44.1kHz + Large Buffers"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -rtbufsize 200M \
    -f avfoundation \
    -thread_queue_size 4096 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 44100 -ac 2 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test4-44100hz-large-buffers.mp4" 2>&1 | tee "$OUTDIR/test4.log"

echo "✅ Test 4 complete"

# Analyze all recordings
echo ""
echo "=========================================="
echo "📊 ANALYSIS"
echo "=========================================="
echo ""

for i in 1 2 3 4; do
    echo "--- Test $i ---"
    ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,channels,codec_name -of default=noprint_wrappers=1 "$OUTDIR/test${i}-"*.mp4 2>/dev/null

    # Check for warnings in logs
    if grep -qi "overrun\|underrun\|drop\|buffer" "$OUTDIR/test${i}.log" 2>/dev/null; then
        echo "⚠️ WARNING: Buffer issues detected in log"
    fi
    echo ""
done

echo "=========================================="
echo "🎧 LISTENING TEST RESULTS"
echo "=========================================="
echo ""
echo "Files saved to: $OUTDIR"
echo ""
echo "Listen to each file in this order:"
echo ""
echo "  1. test1-44100hz.mp4                    (44.1kHz)"
echo "  2. test2-48000hz.mp4                    (48kHz - current)"
echo "  3. test3-native.mp4                     (Device default)"
echo "  4. test4-44100hz-large-buffers.mp4      (44.1kHz + buffers)"
echo ""
echo "Rate each one:"
echo ""
echo "Test 1 (44.1kHz):              ☐ No crackling  ☐ Some crackling  ☐ Heavy crackling"
echo "Test 2 (48kHz):                ☐ No crackling  ☐ Some crackling  ☐ Heavy crackling"
echo "Test 3 (Native):               ☐ No crackling  ☐ Some crackling  ☐ Heavy crackling"
echo "Test 4 (44.1kHz + buffers):    ☐ No crackling  ☐ Some crackling  ☐ Heavy crackling"
echo ""
echo "Which test sounds BEST (clearest, no crackling)?"
echo ""
echo "Report back with the test number, and I'll update ClipForge to use that configuration!"
echo ""

# Open the folder
open "$OUTDIR"
