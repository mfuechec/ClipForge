#!/bin/bash

# Final Audio Optimization Test
# Focuses on buffer sizes and AAC encoder quality

echo "🎯 Final Audio Optimization Test"
echo "================================="
echo ""
echo "Testing final optimizations to eliminate crackling:"
echo "  1. Baseline (current config)"
echo "  2. Large AVFoundation buffers"
echo "  3. High-quality AAC encoder"
echo "  4. Combined: Large buffers + HQ encoder"
echo ""
echo "Each test is 15 seconds. Speak continuously!"
echo ""
echo "Press Enter to start..."
read

OUTDIR="$HOME/Desktop/clipforge-final-optimization"
mkdir -p "$OUTDIR"

DURATION=15
MIC_DEVICE="0"

# Test 1: Current config (baseline after wallclock fix)
echo ""
echo "======================================"
echo "TEST 1: Baseline (Current Config)"
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
sleep 2

# Test 2: Very large buffers (your research: buffers < 4800 often ignored)
echo ""
echo "======================================"
echo "TEST 2: Very Large Buffers"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -probesize 100M \
    -rtbufsize 200M \
    -f avfoundation \
    -thread_queue_size 8192 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test2-large-buffers.mp4" 2>&1 | tee "$OUTDIR/test2.log"

echo "✅ Test 2 complete"
sleep 2

# Test 3: High-quality AAC encoder with quality flags
echo ""
echo "======================================"
echo "TEST 3: High-Quality AAC Encoding"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -f avfoundation \
    -thread_queue_size 2048 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -aac_ltp 1 -profile:a aac_low \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test3-hq-aac.mp4" 2>&1 | tee "$OUTDIR/test3.log"

echo "✅ Test 3 complete"
sleep 2

# Test 4: Combined optimization (large buffers + HQ encoder)
echo ""
echo "======================================"
echo "TEST 4: Combined Optimization"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -probesize 100M \
    -rtbufsize 200M \
    -f avfoundation \
    -thread_queue_size 8192 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -profile:a aac_low -movflags +faststart \
    -af "asetpts=PTS-STARTPTS" \
    -y "$OUTDIR/test4-combined.mp4" 2>&1 | tee "$OUTDIR/test4.log"

echo "✅ Test 4 complete"
sleep 2

# Test 5: Alternative - no audio filter at all
echo ""
echo "======================================"
echo "TEST 5: No Audio Filter (Raw)"
echo "======================================"
echo "Recording in 2 seconds..."
sleep 2

ffmpeg -loglevel warning -stats \
    -probesize 100M \
    -rtbufsize 200M \
    -f avfoundation \
    -thread_queue_size 8192 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -profile:a aac_low \
    -y "$OUTDIR/test5-no-filter.mp4" 2>&1 | tee "$OUTDIR/test5.log"

echo "✅ Test 5 complete"

# Analyze all recordings
echo ""
echo "=========================================="
echo "📊 ANALYSIS"
echo "=========================================="
echo ""

for i in 1 2 3 4 5; do
    if [ -f "$OUTDIR/test${i}-"*.mp4 ]; then
        echo "--- Test $i ---"
        ffprobe -v error -select_streams a:0 \
            -show_entries stream=sample_rate,channels,codec_name,bit_rate \
            -of default=noprint_wrappers=1 "$OUTDIR/test${i}-"*.mp4 2>/dev/null

        # Check for buffer warnings
        if [ -f "$OUTDIR/test${i}.log" ]; then
            WARNINGS=$(grep -i "buffer\|overrun\|underrun\|drop\|frame" "$OUTDIR/test${i}.log" | grep -v "speed\|time\|size\|bitrate" | wc -l)
            if [ "$WARNINGS" -gt 0 ]; then
                echo "⚠️ $WARNINGS warnings in log"
                grep -i "buffer\|overrun\|underrun\|drop" "$OUTDIR/test${i}.log" | grep -v "speed\|time\|size\|bitrate" | head -3
            else
                echo "✅ No warnings"
            fi
        fi

        echo "File size: $(ls -lh "$OUTDIR/test${i}-"*.mp4 2>/dev/null | awk '{print $5}')"
        echo ""
    fi
done

echo "=========================================="
echo "🎧 CRITICAL LISTENING TEST"
echo "=========================================="
echo ""
echo "Files saved to: $OUTDIR"
echo ""
echo "Listen to each recording carefully:"
echo ""
echo "  1. test1-baseline.mp4           (Current config)"
echo "  2. test2-large-buffers.mp4      (8K thread queue)"
echo "  3. test3-hq-aac.mp4             (192k AAC)"
echo "  4. test4-combined.mp4           (Large buffers + HQ AAC)"
echo "  5. test5-no-filter.mp4          (No timestamp filter)"
echo ""
echo "Rate the crackling:"
echo ""
echo "Test 1 (Baseline):         ☐ None  ☐ Minimal  ☐ Noticeable"
echo "Test 2 (Large buffers):    ☐ None  ☐ Minimal  ☐ Noticeable"
echo "Test 3 (HQ AAC):           ☐ None  ☐ Minimal  ☐ Noticeable"
echo "Test 4 (Combined):         ☐ None  ☐ Minimal  ☐ Noticeable"
echo "Test 5 (No filter):        ☐ None  ☐ Minimal  ☐ Noticeable"
echo ""
echo "💡 GOAL: Find a test with ZERO or MINIMAL crackling"
echo ""
echo "Which test sounds BEST (clearest, least/no crackling)?"
echo "Report the test number back to me!"
echo ""

# Open the folder
open "$OUTDIR"
