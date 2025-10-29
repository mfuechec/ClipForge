# Merge Fix Summary: Floating Point Precision Issues

## Problem
Video merges were failing with the error:
```
[aost#0:1/aac @ 0x...] Could not open encoder before EOF
Task finished with error code: -22 (Invalid argument)
```

This occurred when merging clips without audio streams, where silent audio was being generated using FFmpeg's `anullsrc` filter.

## Root Cause Analysis

### Initial Investigation
The error was caused by floating-point precision issues in duration values passed to FFmpeg. Even though we rounded values to 3 decimal places (milliseconds) in Rust, when these values were formatted as strings, they would sometimes include many unwanted decimal places due to floating-point representation:

**Examples from logs:**
- `duration=6.981999999999999` ❌ (caused AAC encoder failure)
- `duration=5.133000000000001` ❌ (caused AAC encoder failure)
- `duration=4.449999999999999` ❌ (caused AAC encoder failure)
- `duration=1.47` ✅ (worked correctly)
- `duration=2.957` ✅ (worked correctly)

### Why This Happened
1. Trim values came from the frontend with high precision (e.g., `4.3134374`, `10.9109`)
2. We rounded them using `(value * 1000.0).round() / 1000.0`
3. However, when calculating `duration = end - start`, floating-point arithmetic could introduce new precision errors
4. Using Rust's default `format!("{}", duration)` would include all these precision errors in the string
5. FFmpeg's AAC encoder is sensitive to these precision issues and would fail

## Solution

### 1. Created Unified Rounding Helper (src-tauri/src/lib.rs:52-56)
```rust
// Helper function to round floating point values to 3 decimal places (milliseconds)
// This avoids FFmpeg precision issues with timing values
fn round_to_millis(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}
```

This centralizes the rounding logic instead of repeating `(value * 1000.0).round() / 1000.0` throughout the code.

### 2. Applied Rounding at Multiple Points
- **Line 530-533**: Round trim_start, trim_end, audio_trim_start, audio_trim_end immediately when they enter the function
- **Line 576, 586**: Round calculated durations (end - start)
- **Line 602**: Round durations from ffprobe

### 3. Fixed String Formatting (CRITICAL FIX)
Changed duration formatting from default `{}` to `{:.3}` to ensure exactly 3 decimal places:

**Line 616** (video color filter):
```rust
let duration_str = format!("{:.3}", duration);
format!("color=c=black:s=1920x1080:d={},fps=30[v]", duration_str)
```

**Line 634-636** (anullsrc silent audio):
```rust
let duration_str = format!("{:.3}", duration);
log::info!("Clip {} generating silent audio with duration: {} (formatted as {})", i, duration, duration_str);
format!("anullsrc=channel_layout=stereo:sample_rate=44100:duration={}[a]", duration_str)
```

### 4. Added Comprehensive Debug Logging
- **Line 587**: Log raw duration, start, end, and rounded values for calculated durations
- **Line 605**: Log durations obtained from ffprobe
- **Line 635**: Log what's being sent to FFmpeg for silent audio generation

## Results

### Before Fix
```
FFmpeg command: ... duration=6.981999999999999[a] ...
[ERROR] FFmpeg failed for clip 1: Could not open encoder before EOF
```

### After Fix
```
Clip 0 duration: raw=2.177, start=0, end=2.177, rounded=2.177
Clip 0 generating silent audio with duration: 2.177 (formatted as 2.177)
FFmpeg command: ... duration=2.177[a] ...
Multi-clip export successful!
```

## Additional Improvements

### Error Message Enhancement
Added user-friendly error messages (src-tauri/src/lib.rs:693-726) that parse FFmpeg errors and provide contextual hints:
- Audio/video sync issues → "Try adjusting the clip boundaries slightly"
- File not found → "The source video may have been moved or deleted"
- Corrupted files → "Appears to be corrupted or in an unsupported format"
- Permission errors → "Check file permissions"
- Generic errors → Show only key error lines (max 3) instead of full FFmpeg output

### UI Cleanup
Removed the AudioRecordingTestPanel component from App.jsx as it was no longer needed.

## Files Modified
- `/Users/mfuechec/Desktop/Gauntlet Projects/ClipForge/src-tauri/src/lib.rs`
  - Added `round_to_millis()` helper function
  - Applied rounding to all trim and duration calculations
  - Fixed duration string formatting with `{:.3}`
  - Added debug logging
  - Improved error messages

- `/Users/mfuechec/Desktop/Gauntlet Projects/ClipForge/src/App.jsx`
  - Removed AudioRecordingTestPanel import and usage

## Key Lessons

1. **Floating-point precision matters**: Even after rounding, string formatting can introduce precision issues
2. **Format strings carefully**: Use `{:.3}` instead of `{}` for floating-point values that need specific precision
3. **Round at the source**: Apply rounding immediately when values enter the system
4. **Round calculations**: Even rounded values can produce high-precision results when combined (e.g., `end - start`)
5. **Add debugging early**: Comprehensive logging helped identify where precision was being lost
6. **External tools are sensitive**: FFmpeg's AAC encoder is very strict about timing precision

## Testing
The fix has been verified to work correctly with:
- Videos without audio (generating silent audio with anullsrc)
- Videos with audio
- Multiple clips in a merge
- Various duration lengths and trim points
