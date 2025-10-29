#!/bin/bash

# Comparison Audio Test - Same phrase, different capture settings
# Based on findings: 44kHz and no-wallclock reduced crackling

echo "🔬 Audio Comparison Test Suite"
echo "==============================="
echo ""
echo "You'll record the SAME PHRASE 6 times with different settings."
echo "This lets you compare the same audio content side-by-side."
echo ""
echo "📝 Please say this phrase each time:"
echo "    'Testing ClipForge audio recording, one two three four five,'"
echo "    'The quick brown fox jumps over the lazy dog.'"
echo ""
echo "Ready? Press Enter to start..."
read

OUTDIR="$HOME/Desktop/clipforge-audio-comparison"
mkdir -p "$OUTDIR"

DURATION=15
MIC_DEVICE="0"  # MacBook Pro Microphone

# Test 1: Minimal (baseline)
echo ""
echo "======================================"
echo "TEST 1: Minimal Configuration"
echo "======================================"
echo "Say the phrase now! Recording in 2 seconds..."
sleep 2
ffmpeg -loglevel error -stats \
    -f avfoundation \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 \
    -y "$OUTDIR/test1-minimal.mp4"
echo "✅ Test 1 complete"
sleep 1

# Test 2: 44.1kHz instead of 48kHz (user said this helped!)
echo ""
echo "======================================"
echo "TEST 2: 44.1kHz Sample Rate"
echo "======================================"
echo "Say the phrase again! Recording in 2 seconds..."
sleep 2
ffmpeg -loglevel error -stats \
    -f avfoundation \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 44100 \
    -y "$OUTDIR/test2-44khz.mp4"
echo "✅ Test 2 complete"
sleep 1

# Test 3: No wallclock (user said this helped!)
echo ""
echo "======================================"
echo "TEST 3: No Wallclock Timestamps"
echo "======================================"
echo "Say the phrase again! Recording in 2 seconds..."
sleep 2
ffmpeg -loglevel error -stats \
    -rtbufsize 100M \
    -thread_queue_size 2048 \
    -f avfoundation \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 \
    -y "$OUTDIR/test3-no-wallclock.mp4"
echo "✅ Test 3 complete"
sleep 1

# Test 4: 44.1kHz + No wallclock (combining both fixes)
echo ""
echo "======================================"
echo "TEST 4: 44.1kHz + No Wallclock"
echo "======================================"
echo "Say the phrase again! Recording in 2 seconds..."
sleep 2
ffmpeg -loglevel error -stats \
    -rtbufsize 100M \
    -thread_queue_size 2048 \
    -f avfoundation \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 44100 \
    -y "$OUTDIR/test4-44khz-no-wallclock.mp4"
echo "✅ Test 4 complete"
sleep 1

# Test 5: With wallclock (current ClipForge config - should be worse)
echo ""
echo "======================================"
echo "TEST 5: WITH Wallclock (Current ClipForge)"
echo "======================================"
echo "Say the phrase again! Recording in 2 seconds..."
sleep 2
ffmpeg -loglevel error -stats \
    -rtbufsize 100M \
    -thread_queue_size 2048 \
    -f avfoundation \
    -use_wallclock_as_timestamps 1 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 48000 \
    -y "$OUTDIR/test5-with-wallclock-48khz.mp4"
echo "✅ Test 5 complete"
sleep 1

# Test 6: 44.1kHz + With wallclock
echo ""
echo "======================================"
echo "TEST 6: 44.1kHz + WITH Wallclock"
echo "======================================"
echo "Say the phrase one last time! Recording in 2 seconds..."
sleep 2
ffmpeg -loglevel error -stats \
    -rtbufsize 100M \
    -thread_queue_size 2048 \
    -f avfoundation \
    -use_wallclock_as_timestamps 1 \
    -i ":${MIC_DEVICE}" \
    -t $DURATION \
    -c:a aac -b:a 128k -ar 44100 \
    -y "$OUTDIR/test6-44khz-with-wallclock.mp4"
echo "✅ Test 6 complete"

echo ""
echo "=========================================="
echo "🎯 ALL TESTS COMPLETE!"
echo "=========================================="
echo ""
echo "📁 Files saved to: $OUTDIR"
echo ""
echo "🎧 NOW COMPARE THEM:"
echo "   Listen to each file and rate the audio quality:"
echo ""
echo "   test1-minimal.mp4                 - Baseline (48kHz, no wallclock)"
echo "   test2-44khz.mp4                   - 44.1kHz sample rate"
echo "   test3-no-wallclock.mp4            - 48kHz, no wallclock, big buffers"
echo "   test4-44khz-no-wallclock.mp4      - 44.1kHz + no wallclock ⭐"
echo "   test5-with-wallclock-48khz.mp4    - Current ClipForge (should be worst)"
echo "   test6-44khz-with-wallclock.mp4    - 44.1kHz + wallclock"
echo ""
echo "📊 REPORT which has the BEST audio quality!"
echo ""
