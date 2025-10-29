#!/bin/bash

# Audio Buffer Configuration Test
# Tests different buffer sizes and audio format specifications

echo "🔧 Audio Buffer & Format Configuration Test"
echo "============================================"
echo ""
echo "Testing different buffer and format configurations"
echo "to eliminate crackling."
echo ""
echo "This will record 4 tests (10 seconds each)."
echo "Speak continuously!"
echo ""
echo "Press Enter to start..."
read

OUTDIR="$HOME/Desktop/clipforge-buffer-test"
mkdir -p "$OUTDIR"

DURATION=10
MIC_DEVICE="0"

# Test 1: Current config (baseline)
echo ""
echo "======================================"
echo "TEST 1: Current Config (Baseline)"
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
    -y "$OUTDIR/test1-baseline.mp4" 2>&1 | tee "$OUTDIR/test1.log"

echo "✅ Test 1 complete"
sleep 1

# Test 2: Larger thread queue + rtbufsize
echo ""
echo "======================================"
echo "TEST 2: Large Buffers"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -rtbufsize 200M \
    -f avfoundation \
    -thread_queue_size 4096 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test2-large-buffers.mp4" 2>&1 | tee "$OUTDIR/test2.log"

echo "✅ Test 2 complete"
sleep 1

# Test 3: Explicit audio format + buffer
echo ""
echo "======================================"
echo "TEST 3: Explicit Format (f32le)"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -sample_rate 48000 \
    -audio_device_index 0 \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test3-explicit-format.mp4" 2>&1 | tee "$OUTDIR/test3.log"

echo "✅ Test 3 complete"
sleep 1

# Test 4: Mono (match hardware) + large buffers
echo ""
echo "======================================"
echo "TEST 4: Mono + Large Buffers"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -rtbufsize 200M \
    -f avfoundation \
    -thread_queue_size 4096 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 1 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test4-mono-large-buffers.mp4" 2>&1 | tee "$OUTDIR/test4.log"

echo "✅ Test 4 complete"

# Analyze all recordings
echo ""
echo "=========================================="
echo "📊 ANALYSIS"
echo "=========================================="
echo ""

for i in 1 2 3 4; do
    if [ -f "$OUTDIR/test${i}-"*.mp4 ]; then
        echo "--- Test $i ---"
        ffprobe -v error -select_streams a:0 \
            -show_entries stream=sample_rate,channels,codec_name \
            -of default=noprint_wrappers=1 "$OUTDIR/test${i}-"*.mp4 2>/dev/null

        # Check logs for issues
        if [ -f "$OUTDIR/test${i}.log" ]; then
            WARNINGS=$(grep -i "buffer\|overrun\|underrun\|drop" "$OUTDIR/test${i}.log" | wc -l)
            if [ "$WARNINGS" -gt 0 ]; then
                echo "⚠️ $WARNINGS buffer warnings in log"
            else
                echo "✅ No buffer warnings"
            fi
        fi
        echo ""
    fi
done

echo "=========================================="
echo "🎧 LISTENING TEST"
echo "=========================================="
echo ""
echo "Files saved to: $OUTDIR"
echo ""
echo "Listen to each file and rate crackling:"
echo ""
echo "Test 1 (Baseline):           ☐ No crackling  ☐ Light  ☐ Heavy"
echo "Test 2 (Large buffers):      ☐ No crackling  ☐ Light  ☐ Heavy"
echo "Test 3 (Explicit format):    ☐ No crackling  ☐ Light  ☐ Heavy"
echo "Test 4 (Mono + buffers):     ☐ No crackling  ☐ Light  ☐ Heavy"
echo ""
echo "Which test sounds BEST (no crackling)?"
echo ""

# Open the folder
open "$OUTDIR"
