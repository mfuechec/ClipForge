# Debug Logging Guide

## What I Added

### Frontend Logs (Browser Console)
- `[App] Importing video from path:` - When import starts
- `[App] Received metadata:` - What the backend returns
- `[App] Importing recording from path:` - When recording imports
- `[App] Recording metadata:` - Recording metadata received
- `[App] handleAddToTimeline called with clipIndex:` - When you try to add to timeline
- `[App] Clip data:` - Full clip object
- `[App] Clip has duration?` - Whether duration exists and its value
- `[App] Clip missing or no duration` - ERROR when duration is missing
- `[App] Adding clip to timeline:` - SUCCESS when clip is added

### Backend Logs (Tauri Console)
- `import_video called with path:` - Import video command received
- `File does not exist:` - ERROR if file not found
- `Probing video metadata for:` - Starting ffprobe
- `Running ffprobe on:` - Executing ffprobe command
- `Failed to execute ffprobe:` - ERROR if ffprobe not found
- `ffprobe command failed. stderr:` - ERROR if ffprobe fails
- `Extracted duration: X seconds` - Duration found
- `Found X streams` - Number of streams in video
- `Extracted resolution: WxH` - Width and height found
- `Successfully probed metadata` - Full metadata summary
- `Returning metadata:` - Final result being sent to frontend

## How to Test

1. **Start the app:**
   ```bash
   npm run tauri:dev
   ```
   Wait for "Finished dev" message.

2. **Open DevTools:**
   - macOS: Cmd+Option+I
   - Windows/Linux: Ctrl+Shift+I
   - Or right-click → Inspect

3. **Open Console tab** in DevTools

4. **Import or Record a video**

5. **Watch the logs:**

### Expected Successful Flow:

**Backend (Tauri console):**
```
INFO  import_video called with path: /path/to/video.mp4
INFO  Probing video metadata for: video.mp4
INFO  Running ffprobe on: /path/to/video.mp4
INFO  Extracted duration: 5.5 seconds
INFO  Found 2 streams
INFO  Extracted resolution: 1920x1080
INFO  Successfully probed metadata - Duration: 5.5s, Resolution: 1920x1080
INFO  Returning metadata: VideoMetadata { path: "...", filename: "video.mp4", duration: Some(5.5), width: Some(1920), height: Some(1080) }
```

**Frontend (Browser console):**
```
[App] Importing video from path: /path/to/video.mp4
[App] Received metadata: {path: "...", filename: "video.mp4", duration: 5.5, width: 1920, height: 1080}
```

**When you click "+ Add" or drag to timeline:**
```
[App] handleAddToTimeline called with clipIndex: 0
[App] Clip data: {path: "...", filename: "video.mp4", duration: 5.5, width: 1920, height: 1080}
[App] Clip has duration? true Duration value: 5.5
[App] Adding clip to timeline: video.mp4
```

### If Alert Still Appears:

**Look for:**
```
[App] Clip has duration? false Duration value: undefined
[App] Clip missing or no duration. Clip: {path: "...", filename: "...", duration: null}
```

This tells us the metadata is `null` or `undefined`.

### Possible Error Scenarios:

**1. FFmpeg not installed:**
```
ERROR Failed to execute ffprobe: No such file or directory
```
**Solution:** Install FFmpeg with `brew install ffmpeg`

**2. FFprobe fails:**
```
ERROR ffprobe command failed. stderr: [error message]
```
**Solution:** Check if file is corrupted or unsupported format

**3. No video stream:**
```
ERROR No video stream found in 1 streams
```
**Solution:** File might be audio-only

**4. Backend returns null duration:**
```
[App] Received metadata: {duration: null, width: null, height: null}
```
**Solution:** ffprobe failed silently, check backend logs

## What to Share

If the alert still appears, please share:

1. **Full browser console output** (screenshot or copy/paste)
2. **Tauri console output** (the terminal where you ran `npm run tauri:dev`)
3. **The exact moment the alert appears** - after import or after clicking "+ Add"?

## Quick Check

Before testing, verify FFmpeg is installed:
```bash
which ffprobe
# Should show: /usr/local/bin/ffprobe or similar

ffprobe -version
# Should show version number
```

If not found:
```bash
brew install ffmpeg
```
