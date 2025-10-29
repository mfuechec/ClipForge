#!/bin/bash

# Audio Quality Analysis Script
# Analyzes recorded audio files for discontinuities, drops, and quality issues

if [ -z "$1" ]; then
    echo "Usage: $0 <video-file.mp4>"
    echo ""
    echo "This script analyzes audio quality in a recorded file."
    exit 1
fi

VIDEO_FILE="$1"

if [ ! -f "$VIDEO_FILE" ]; then
    echo "❌ File not found: $VIDEO_FILE"
    exit 1
fi

# Find FFmpeg
if command -v ffmpeg &> /dev/null; then
    FFMPEG="ffmpeg"
elif [ -f "/opt/homebrew/bin/ffmpeg" ]; then
    FFMPEG="/opt/homebrew/bin/ffmpeg"
elif [ -f "/usr/local/bin/ffmpeg" ]; then
    FFMPEG="/usr/local/bin/ffmpeg"
else
    echo "❌ FFmpeg not found!"
    exit 1
fi

echo "🔬 Audio Quality Analysis"
echo "=========================="
echo "File: $VIDEO_FILE"
echo ""

# Extract audio stream info
echo "📊 Audio Stream Information:"
echo "----------------------------"
$FFMPEG -i "$VIDEO_FILE" 2>&1 | grep -A 5 "Audio:"
echo ""

# Check for discontinuities in PTS
echo "🔍 Checking for timestamp discontinuities..."
echo "-------------------------------------------"
$FFMPEG -i "$VIDEO_FILE" -af "silencedetect=noise=-50dB:d=0.1" -f null - 2>&1 | grep -i "silence"
echo ""

# Analyze audio levels
echo "📈 Audio Level Analysis:"
echo "------------------------"
$FFMPEG -i "$VIDEO_FILE" -af "volumedetect" -f null - 2>&1 | grep -i "mean\|max"
echo ""

# Check for packet drops (requires ffprobe)
if command -v ffprobe &> /dev/null; then
    echo "📦 Packet Analysis:"
    echo "-------------------"

    # Count audio packets
    PACKET_COUNT=$(ffprobe -v error -select_streams a:0 -count_packets -show_entries stream=nb_read_packets -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE")
    echo "Total audio packets: $PACKET_COUNT"

    # Get duration
    DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE")
    echo "Duration: ${DURATION}s"

    # Calculate expected packets (48kHz, 1024 samples per packet = ~46.875 packets/sec)
    EXPECTED=$(echo "$DURATION * 46.875" | bc)
    echo "Expected packets (48kHz): ~${EXPECTED%.*}"

    # Check packet timestamps for gaps
    echo ""
    echo "Checking for packet timestamp gaps..."
    ffprobe -v error -select_streams a:0 -show_entries packet=pts_time,dts_time -of csv=p=0 "$VIDEO_FILE" > /tmp/audio_pts.txt

    # Simple gap detection (gaps > 100ms)
    awk -F, '{
        if (NR > 1 && prev != "") {
            gap = $1 - prev;
            if (gap > 0.1) {
                printf "⚠️  Large gap detected: %.3fs at timestamp %.2fs\n", gap, prev
            }
        }
        prev = $1
    }' /tmp/audio_pts.txt

    rm -f /tmp/audio_pts.txt
else
    echo "⚠️  ffprobe not found - skipping packet analysis"
fi

echo ""
echo "✅ Analysis complete"
echo ""
echo "🎧 Listen to the file and compare with these metrics:"
echo "   - If you hear choppy audio but see no gaps: encoding issue"
echo "   - If you see large gaps: capture timing issue"
echo "   - If packet count is low: packets being dropped"
echo ""
