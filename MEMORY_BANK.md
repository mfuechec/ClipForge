# ClipForge Memory Bank

## Project Overview
**ClipForge** is a desktop video editor built with Tauri + React for the GauntletAI bootcamp.
- **Timeline**: Built in 3 days (MVP due Tuesday 10:59 PM CT)
- **Status**: ✅ MVP Complete - All core features implemented and tested
- **Architecture**: Tauri v2 (Rust backend) + React 19 (frontend)

## Tech Stack
- **Frontend**: React 19, Vite 6.4.1, Video.js 8.21.1
- **Backend**: Rust (Tauri 2.9.1)
- **Video Processing**: FFmpeg 8.0 (CLI integration)
- **Audio Routing**: BlackHole 2ch (virtual audio driver for system audio capture)
- **Build System**: Tauri CLI, npm scripts
- **Platform**: macOS (Apple Silicon)

## Project Structure
```
ClipForge/
├── src/                          # React frontend
│   ├── App.jsx                   # Main app component with state management
│   ├── App.css                   # App styling
│   ├── components/
│   │   ├── VideoPlayer.jsx       # Video.js player with GPU acceleration
│   │   ├── VideoPlayer.css       # Video player styling with hardware hints
│   │   ├── RecordingControls.jsx # Screen recording UI with audio modal
│   │   ├── RecordingControls.css # Recording controls styling
│   │   ├── AudioSettingsModal.jsx # Audio device and quality settings
│   │   ├── AudioSettingsModal.css # Audio modal styling
│   │   ├── Timeline.jsx          # Timeline UI showing clips
│   │   ├── Timeline.css          # Timeline styling
│   │   ├── TrimControls.jsx     # Trim control buttons and display
│   │   └── TrimControls.css     # Trim controls styling
│   └── main.jsx                  # React entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   └── lib.rs               # Tauri commands (import/export/recording)
│   ├── Cargo.toml               # Rust dependencies
│   ├── tauri.conf.json          # Tauri configuration
│   └── capabilities/
│       └── default.json         # Permissions configuration
├── dist/                         # Build output (frontend)
└── target/                       # Rust build artifacts
    └── release/
        └── bundle/
            ├── macos/
            │   └── ClipForge.app          # Standalone macOS app
            └── dmg/
                └── ClipForge_0.1.0_aarch64.dmg  # Distributable installer (3.5 MB)
```

## Core Features Implemented

### 1. Video Import
- **File Picker**: Tauri dialog plugin for file selection
- **Supported Formats**: MP4, MOV, WebM, AVI
- **Implementation**: `src/App.jsx:handleImportVideo()`, `src-tauri/src/lib.rs:import_video()`
- **State Management**: Clips stored in App state with metadata (path, filename, duration, width, height)

### 2. Video Player
- **Technology**: Video.js 8.21.1 - professional HTML5 video player
- **Asset Protocol**: Uses `convertFileSrc()` from Tauri API for secure local file access
- **GPU Acceleration**: CSS hardware hints (will-change, translateZ, backface-visibility)
- **Features**:
  - Multiple playback speeds (0.5x, 1x, 1.5x, 2x, 3x)
  - HTTP Range support via Tauri's video:// protocol
  - Smooth seeking and scrubbing
  - Professional playback controls
- **Metadata Extraction**:
  - Extracts duration, width, height via `loadedmetadata` event
  - Updates clip state via `handleVideoLoaded` callback
- **Location**: `src/components/VideoPlayer.jsx`

### 3. Timeline UI
- **Display**: Shows all imported clips with thumbnails and metadata
- **Selection**: Click to select/switch between clips
- **Metadata Display**: Filename, duration, trim status badge
- **Visual Indicator**: Blue border on selected clip
- **Location**: `src/components/Timeline.jsx`

### 4. Trim Functionality
- **Set In Point**: Button to mark trim start at current playback time
- **Set Out Point**: Button to mark trim end at current playback time
- **Clear Trim**: Remove all trim markers
- **Visual Indicators**:
  - Blue `[` and `]` markers on timeline showing in/out points
  - Blue highlighted region showing selected portion
  - Trim duration display in TrimControls component
  - "✂️ Trimmed: X.XXs" badge in Timeline
- **State Storage**: trimStart and trimEnd stored per clip
- **Location**: `src/components/TrimControls.jsx`, `src/components/VideoPlayer.jsx:75-109`

### 5. Video Export (FFmpeg Integration)
- **Backend**: Rust command spawns FFmpeg CLI process
- **Export Settings**:
  - Video: H.264 (libx264), CRF 23, fast preset
  - Audio: AAC, 128k bitrate
  - Format: MP4
- **Trim Support**:
  - Uses `-ss` (start time) and `-t` (duration) flags when trim points set
  - Exports full video if no trim points
- **Error Handling**: Checks FFmpeg installation, provides detailed error messages
- **Save Dialog**: Tauri save file dialog with default filename
- **Location**: `src-tauri/src/lib.rs:47-91`, `src/App.jsx:118-168`

### 6. Screen Recording with Audio (FULLY IMPLEMENTED)
- **Recording Modes**:
  - Screen: Capture screen with cursor using AVFoundation
  - Webcam: Record from camera with audio
  - Screen + Webcam: Combo recording (PiP style - planned)
- **Audio System**:
  - **Microphone Recording**: Built-in or external mic via AVFoundation
  - **System Audio Recording**: Virtual audio driver (BlackHole 2ch)
  - **Dual Audio Mixing**: FFmpeg amerge filter combines mic + system audio
  - **Audio Quality Presets**:
    - Voice: 64 kbps (optimized for speech)
    - Standard: 128 kbps (balanced quality)
    - High: 256 kbps (best quality)
  - **Device Selection**: Dynamic audio device enumeration
  - **Audio Settings Modal**: Pre-recording configuration UI
- **Backend Implementation**: `src-tauri/src/lib.rs`
  - `start_recording()`: Spawns FFmpeg with audio configuration
  - `stop_recording()`: Sends SIGINT, recognizes exit code 255 as normal
  - `list_audio_devices()`: Enumerates AVFoundation audio devices
  - Uses RecordingState mutex to track active recording process
- **Frontend Components**:
  - `RecordingControls.jsx`: Mode selector, timer, stop button
  - `AudioSettingsModal.jsx`: Audio device selection, quality, toggles
- **Recording Settings** (Current - Oct 27, 2025):
  - **Input**: AVFoundation (`-f avfoundation`)
  - **Frame Rate**: 30 fps constant (`-framerate 30 -r 30 -vsync cfr`)
  - **Resolution**: 1080p downscale for performance (`-vf scale=1920:1080`)
  - **Video Codec**: H.264 Main Profile Level 4.0
  - **Audio Codec**: AAC with configurable bitrate
  - **Encoder Tuning**: `-tune fastdecode` for smooth playback
  - **Container**: MP4 with `+faststart` for web compatibility
  - **Timescale**: 90000 (standard MPEG timescale)
  - **GOP Size**: 30 (keyframe every second at 30fps)
  - **No B-frames**: `-bf 0` for simpler decoding
- **Workflow**:
  1. User selects recording mode
  2. Audio settings modal appears
  3. User configures mic/system audio/quality
  4. FFmpeg saves to `/tmp/clipforge-{mode}-{timestamp}.mp4`
  5. Recording stops via SIGINT signal (exit code 255 = success)
  6. Video auto-imports into timeline
- **Setup Guide**: `AUDIO_SETUP_GUIDE.md` documents BlackHole installation
- **Platform Support**: macOS AVFoundation (Windows/Linux planned)

## Key Technical Decisions & Fixes

### Problem 1: Import Button Not Working
- **Cause**: Missing dialog permissions in capabilities
- **Fix**: Added `"dialog:default"` to `src-tauri/capabilities/default.json`
- **Location**: Line 10 in capabilities/default.json

### Problem 2: Video Files Couldn't Play
- **Cause**: Using `file://` protocol instead of Tauri's asset protocol
- **Fix**:
  1. Import `convertFileSrc` from `@tauri-apps/api/core`
  2. Changed to `convertFileSrc(videoPath)`
  3. Added assetProtocol config in tauri.conf.json with `scope: ["**"]`
- **Location**: `src/components/VideoPlayer.jsx:31`, `src-tauri/tauri.conf.json:24-27`

### Problem 3: Timeline Showing "Unknown Duration"
- **Cause**: Race condition - metadata loaded before React attached event listener
- **Fix**:
  1. Immediate `readyState` check after `video.load()`
  2. setTimeout fallback (100ms)
  3. Keep `onLoadedMetadata` as backup
- **Location**: `src/components/VideoPlayer.jsx:28-47`

### Problem 4: Infinite Re-render Loop
- **Cause**: `handleVideoLoaded` recreated on every render, triggering useEffect dependency
- **Fix**:
  1. Wrapped in `useCallback` with proper dependencies
  2. Used functional state update `setClips(prevClips => ...)`
- **Location**: `src/App.jsx:42-65`

### ✅ Problem 5: RESOLVED - Video Player Performance (Fixed with Video.js)
- **Status**: ✅ RESOLVED - Migrated to Video.js
- **Original Issue**: Native HTML5 video player had performance issues with macOS AVPlayerView overlay
- **Solution**: Complete migration to Video.js professional player
- **Implementation**:
  ```javascript
  // Installed video.js
  npm install video.js

  // VideoPlayer.jsx now uses:
  import videojs from 'video.js';
  import 'video.js/dist/video-js.css';

  const player = videojs(videoRef.current, {
    controls: true,
    autoplay: false,
    preload: 'metadata',
    playbackRates: [0.5, 1, 1.5, 2, 3],
  });
  ```
- **Benefits**:
  - Cross-platform compatibility
  - Hardware-accelerated playback
  - Professional controls and UI
  - Multiple playback speed support
  - Smooth seeking and scrubbing
  - HTTP Range support via Tauri's asset protocol
- **GPU Acceleration**: Added CSS hints for better performance
  ```css
  .video-container {
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
    perspective: 1000px;
  }
  ```

### ⚠️ Problem 6: Audio Recording "Failed to Stop" Error (RESOLVED)
- **Status**: ✅ RESOLVED - Fixed exit code handling
- **Symptoms**: FFmpeg recorded successfully but showed "Failed to stop recording: exit status: 255"
- **Root Cause**: FFmpeg returns exit code 255 when stopped via SIGINT - this is NORMAL
- **Evidence**: Logs showed successful recording before error:
  ```
  frame= 215 fps= 30 q=-1.0 Lsize=4175KiB time=00:00:07.16 bitrate=4772.3kbits/s
  Exiting normally, received signal 2.
  ```
- **Fix**: Updated `stop_recording()` to recognize 255 and signal 2 as success
  ```rust
  #[cfg(unix)]
  let is_normal_exit = {
      use std::os::unix::process::ExitStatusExt;
      status.code() == Some(255) || status.signal() == Some(2) || status.success()
  };
  ```
- **Location**: `src-tauri/src/lib.rs:629-665`

### ⚠️ Problem 7: Audio Device Filter Graph Error (RESOLVED)
- **Status**: ✅ RESOLVED - Added device validation
- **Symptoms**: FFmpeg error "Invalid file index 1" when dual audio enabled with "none" device
- **Root Cause**: System audio toggle ON but device was "none"
- **Fix**: Validate system audio device before enabling dual audio mode
  ```rust
  let sys_audio_enabled = audio_settings
      .map(|s| {
          s.system_audio_enabled
          && !s.system_audio_device.is_empty()
          && s.system_audio_device != "none"
      })
      .unwrap_or(false);
  ```
- **Location**: `src-tauri/src/lib.rs` in `start_recording()` function

### ⚠️ Problem 8: Timeline Layout Overflow (RESOLVED)
- **Status**: ✅ RESOLVED - Fixed responsive layout
- **Date**: October 27, 2025
- **Symptoms**: Media library and timeline section required scrolling, text clipping in clip cards
- **Root Cause**:
  - Timeline section height (240px) insufficient for content
  - Section headers taking up unnecessary space
  - Media library clip cards not accounting for padding/borders
- **Fix**:
  1. Removed section headers (MEDIA LIBRARY/TIMELINE titles) - `Timeline.jsx:28-31, 65-68`
  2. Increased timeline section height from 240px to 260px - `App.css:66`
  3. Set media library to 100px fixed height - `Timeline.css:26-27`
  4. Optimized spacing:
     - Timeline padding: 12px vertical - `Timeline.css:4`
     - Gap between sections: 10px - `Timeline.css:8`
     - Trim controls padding: 8px vertical - `TrimControls.css:3`
  5. Made trim controls more compact:
     - Button padding: 6px/12px - `TrimControls.css:22`
     - Badge padding: 4px/8px - `TrimControls.css:65`
     - Font sizes reduced to 12px/11px
  6. Library clip cards use `height: fit-content` - `Timeline.css:63`
- **Result**: All UI elements fit on screen without vertical scrolling
- **Locations**:
  - `src/App.css:66` (timeline section height)
  - `src/components/Timeline.css:2-31` (container and library styling)
  - `src/components/Timeline.jsx:28, 65` (removed headers)
  - `src/components/TrimControls.css:3, 13, 22, 59, 65` (compact controls)

### ⚠️ Problem 9: Video.js Initialization DOM Warning (RESOLVED)
- **Status**: ✅ RESOLVED - Fixed with callback refs pattern
- **Date**: October 27, 2025
- **Symptoms**:
  - Warning: "VIDEOJS: WARN - The element supplied is not included in the DOM"
  - Video would stop playing after ~0.5 seconds
  - Player being disposed and recreated unexpectedly
- **Root Cause**:
  - Video element conditionally rendered based on videoPath (`{videoPath ? <video/> : <placeholder/>}`)
  - useEffect with callback dependencies (`onVideoLoaded`, `onTimeUpdate`) re-ran when callbacks changed
  - Player was disposed and recreated on every callback change, causing video to stop
  - Initial mount: element didn't exist yet when useEffect ran
- **Fix**:
  1. **Store callbacks in refs** to prevent effect re-runs:
     ```javascript
     const onTimeUpdateRef = useRef(onTimeUpdate);
     const onVideoLoadedRef = useRef(onVideoLoaded);

     // Update refs when callbacks change (separate effect)
     useEffect(() => {
       onTimeUpdateRef.current = onTimeUpdate;
       onVideoLoadedRef.current = onVideoLoaded;
     }, [onTimeUpdate, onVideoLoaded]);
     ```
  2. **Use refs in event listeners** instead of callback directly:
     ```javascript
     player.on('timeupdate', () => {
       if (onTimeUpdateRef.current) {
         onTimeUpdateRef.current(player.currentTime());
       }
     });
     ```
  3. **Single dependency** - only re-run effect when videoPath changes:
     ```javascript
     useEffect(() => {
       // ... player initialization
     }, [videoPath]); // Only videoPath, not callbacks
     ```
  4. **Check for both element and path** before initializing:
     ```javascript
     if (!videoRef.current || !videoPath) {
       return; // Skip if missing
     }
     ```
  5. **Create player once, update source** when path changes:
     ```javascript
     if (!playerRef.current) {
       // Create new player
       playerRef.current = videojs(videoRef.current, {...});
     }
     // Always update source (new or existing player)
     playerRef.current.src({src: convertFileSrc(videoPath), type: 'video/mp4'});
     ```
- **Result**:
  - No more DOM warnings
  - Player created once and reused
  - Video plays continuously without stopping
  - Source updates seamlessly when timeline changes
- **Location**: `src/components/VideoPlayer.jsx:13-95`
- **Key Pattern**: Use refs for callbacks that shouldn't trigger effects, only re-run when actual data (videoPath) changes

## State Management Architecture

### App.jsx State
```javascript
const [clips, setClips] = useState([]);           // All imported clips
const [selectedClipIndex, setSelectedClipIndex] = useState(null);  // Currently selected clip
const [currentTime, setCurrentTime] = useState(0);  // Video playback time
const [isExporting, setIsExporting] = useState(false);  // Export in progress
```

### Clip Object Structure
```javascript
{
  path: "/path/to/video.mov",          // Full file path
  filename: "video.mov",               // Display name
  duration: 12.35,                     // Duration in seconds
  width: 1920,                         // Video width
  height: 1080,                        // Video height
  trimStart: 2.5,                      // Trim start time (optional)
  trimEnd: 8.3                         // Trim end time (optional)
}
```

## Debug Tools

### Console Logging
- All major operations log to console with `[ComponentName]` prefix
- Example: `[App] Set trim start: 2.5`

### Window Debug Hook
```javascript
// Access clips array from browser console
window.__clips
```

### Visual Indicators
- Timeline badge shows trim status: `✂️ Trimmed: 5.00s`
- Blue region on video timeline shows selected portion

## Build & Distribution

### Development Mode
```bash
npm run tauri:dev
# Opens at http://localhost:1420/
# Hot-reloads on file changes
```

### Production Build
```bash
npm run tauri:build
# Outputs:
# - ClipForge.app (standalone app)
# - ClipForge_0.1.0_aarch64.dmg (3.5 MB installer)
```

### Build Output Locations
- **App Bundle**: `src-tauri/target/release/bundle/macos/ClipForge.app`
- **DMG Installer**: `src-tauri/target/release/bundle/dmg/ClipForge_0.1.0_aarch64.dmg`

## Dependencies

### Frontend (package.json)
- react: ^19.2.0
- react-dom: ^19.2.0
- video.js: ^8.21.1
- @tauri-apps/api: ^2.9.0
- @tauri-apps/plugin-dialog: ^2.4.2
- vite: ^6.4.1

### Backend (Cargo.toml)
- tauri: { version = "2.9.1", features = ["macos-private-api", "protocol-asset"] }
- tauri-plugin-dialog: "2"
- tauri-plugin-log: "2"
- serde: { version = "1.0", features = ["derive"] }
- serde_json: "1.0"
- log: "0.4"
- libc: "0.2" (UNIX only - for SIGINT signal handling)

### System Requirements
- **FFmpeg**: Must be installed on system for recording and export functionality
  - macOS: `brew install ffmpeg`
  - Version: 8.0+ with libx264, aac, and AVFoundation support
  - Required for: Screen recording, video export, multi-clip concatenation, audio mixing
- **BlackHole** (Optional): Virtual audio driver for system audio capture
  - macOS: `brew install blackhole-2ch`
  - Setup guide: `AUDIO_SETUP_GUIDE.md`
  - Required for: Recording system audio (computer sounds, music, apps)

## Known Limitations & Future Enhancements

### Current Limitations
1. **FFmpeg Dependency**: Users must install FFmpeg separately
2. **BlackHole Setup**: System audio requires manual BlackHole installation and configuration
3. **Single Clip Export**: Can only export one clip at a time
4. **No Multi-clip Composition**: Cannot stitch multiple clips together
5. **Basic Trim Only**: No advanced editing (transitions, effects, etc.)
6. **Bundle Identifier Warning**: `com.clipforge.app` ends with `.app` (conflicts with macOS extension)
7. **macOS Only**: Recording feature currently only works on macOS (AVFoundation)

### Potential Enhancements
1. **Bundle FFmpeg**: Include FFmpeg binary in app bundle
2. **Auto BlackHole Setup**: Automated installation and configuration for system audio
3. **Multi-clip Editing**: Concatenate multiple clips in timeline
4. **Real-time Preview**: Show trimmed portion during playback
5. **Drag & Drop**: Import videos via drag-and-drop
6. **Export Presets**: Different quality/format options
7. **Progress Bar**: Show FFmpeg export/recording progress
8. **Thumbnails**: Generate video thumbnails for timeline
9. **Keyboard Shortcuts**: I/O keys for trim points, Space for play/pause
10. **Undo/Redo**: State history management
11. **Save Project**: Persist timeline state to file
12. **Audio Waveform**: Visualize audio in timeline
13. **Combo Recording**: Picture-in-picture screen + webcam
14. **Cross-platform Recording**: Windows (DirectShow), Linux (X11) support
15. **Audio Level Meters**: Real-time audio input monitoring during recording
16. **Audio Sync Offset**: Fine-tune audio/video synchronization

## Testing Checklist

✅ **Import Video**
- [x] MP4 files import successfully
- [x] MOV files import successfully
- [x] Duration displays correctly in timeline
- [x] Video plays in player

✅ **Screen Recording with Audio** (Fully Functional)
- [x] Recording mode selector displays
- [x] Audio settings modal with device selection
- [x] Microphone recording works
- [x] System audio recording setup documented (BlackHole)
- [x] Dual audio mixing (mic + system audio)
- [x] Audio quality presets (voice/standard/high)
- [x] Screen recording starts and shows timer
- [x] Recording stops gracefully (no false errors)
- [x] Recording auto-imports into timeline
- [x] Video playback works correctly (Video.js)

✅ **Trim Functionality**
- [x] Set In Point button marks start time
- [x] Set Out Point button marks end time
- [x] Blue markers appear on timeline
- [x] Trim duration calculated correctly
- [x] Clear Trim removes markers
- [x] Trim badge shows in timeline

✅ **Export**
- [x] Export button opens save dialog
- [x] Export with trim points creates correct duration video
- [x] Export without trim points exports full video
- [x] Success message shows output path
- [x] Exported video plays correctly

✅ **Production Build**
- [x] App builds without errors
- [x] DMG installer created
- [x] Standalone .app launches
- [x] All features work in production build

## Important Code Locations

### Critical Functions
1. **handleImportVideo**: `src/App.jsx:21-39` - Import video file via dialog
2. **handleVideoLoaded**: `src/App.jsx:42-65` - Update clip metadata from video element
3. **handleSetTrimStart**: `src/App.jsx:68-80` - Set trim start point
4. **handleSetTrimEnd**: `src/App.jsx:82-94` - Set trim end point
5. **handleExportVideo**: `src/App.jsx:118-168` - Export video with FFmpeg
6. **export_video** (Rust): `src-tauri/src/lib.rs:47-91` - FFmpeg command execution
7. **list_audio_devices** (Rust): `src-tauri/src/lib.rs:259-316` - Enumerate AVFoundation audio devices
8. **start_recording** (Rust): `src-tauri/src/lib.rs:237-340` - Start screen recording with audio
9. **stop_recording** (Rust): `src-tauri/src/lib.rs:342-380` - Stop recording with SIGINT (handles exit code 255)
10. **handleStartRecording**: `src/components/RecordingControls.jsx:47-85` - Frontend recording start with audio settings
11. **handleStopRecording**: `src/components/RecordingControls.jsx:88-109` - Frontend recording stop
12. **AudioSettingsModal**: `src/components/AudioSettingsModal.jsx` - Audio device selection and configuration
13. **loadAudioDevices**: `src/components/AudioSettingsModal.jsx:23-41` - Load and filter audio devices

### State Update Patterns
- Always use `useCallback` for handlers passed to child components
- Use functional state updates: `setClips(prevClips => ...)`
- Include minimal dependencies in useCallback dependency array

## Configuration Files

### tauri.conf.json Key Settings
```json
{
  "identifier": "com.clipforge.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build:frontend",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,  // Required for certain video features
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": ["**"]  // Allow access to all local files
      }
    }
  }
}
```

**Note**: Custom `video://` protocol implemented in lib.rs but not currently used (VideoPlayer uses asset protocol instead).

### Capabilities/Permissions
```json
{
  "permissions": [
    "core:default",
    "dialog:default"
  ]
}
```

## Git Status (At Completion)
- Modified files: .gitignore, package.json, package-lock.json
- Untracked: .claudeignore, ClipForge.md, index.html, src-tauri/, src/, vite.config.js
- Branch: main
- Ready for commit and push

## Performance Metrics
- **Initial Load**: ~97ms (Vite HMR)
- **Build Time**: ~1m 6s (Rust compilation + bundling)
- **App Size**: 3.5 MB DMG
- **Export Speed**: Depends on video length and FFmpeg performance

## Troubleshooting Guide

### "FFmpeg not found" Error
```bash
# Install FFmpeg
brew install ffmpeg

# Verify installation
ffmpeg -version
```

### Video Won't Play
- Check file format is supported (MP4, MOV, WebM, AVI)
- Verify assetProtocol is enabled in tauri.conf.json
- Check browser console for errors

### Export Fails
- Ensure FFmpeg is installed
- Check disk space for output file
- Verify input video file still exists
- Check console logs for FFmpeg stderr

### Dev Server Won't Start
```bash
# Kill processes on port 1420
lsof -ti:1420 | xargs kill -9

# Restart dev server
npm run tauri:dev
```

### Audio Device Not Showing Up
- **Symptoms**: Audio device list is empty or shows "Default Microphone" only
- **Causes**:
  1. Microphone permission not granted
  2. BlackHole not installed (for system audio)
  3. Need to restart app after device installation
- **Fix**:
  ```bash
  # Grant microphone permission in System Settings
  # System Settings > Privacy & Security > Microphone > ClipForge

  # Install BlackHole for system audio
  brew install blackhole-2ch

  # Restart ClipForge
  # Restart entire app after installing new audio devices
  ```
- **Setup Guide**: See `AUDIO_SETUP_GUIDE.md` for complete BlackHole configuration

### "Failed to Stop Recording" Error
- **Status**: ✅ RESOLVED (Oct 27, 2025)
- **Symptoms**: Recording succeeds but shows error: "Failed to stop recording: exit status: 255"
- **Root Cause**: FFmpeg returns exit code 255 when stopped via SIGINT - this is NORMAL behavior
- **Fix**: Updated `stop_recording()` to recognize exit code 255 as success
- **Location**: `src-tauri/src/lib.rs:629-665`

### Recording Fails to Start
```bash
# Check FFmpeg has AVFoundation support
ffmpeg -devices

# Should show:
# Devices:
#  D  avfoundation    AVFoundation input device

# If missing, reinstall FFmpeg:
brew reinstall ffmpeg
```

## Contact & Resources
- **Project Location**: `/Users/mfuechec/Desktop/Gauntlet Projects/ClipForge`
- **Tauri Docs**: https://tauri.app/
- **FFmpeg Docs**: https://ffmpeg.org/documentation.html
- **React Docs**: https://react.dev/

---

**Project Started**: October 25, 2025
**MVP Completed**: October 27, 2025
**Recording Feature Added**: October 27, 2025
**Audio System Implemented**: October 27, 2025
**Video Player Fixed**: October 27, 2025

**MVP Status**: ✅ All core features fully implemented and tested
**Build Status**: ✅ Production app packaged and ready for distribution
**Critical Issues**: ✅ NONE - All major issues resolved

**Feature Completeness**:
- ✅ Video Import (file picker)
- ✅ Video Player (Video.js with GPU acceleration)
- ✅ Timeline UI (clip selection and display)
- ✅ Trim Controls (in/out points with visual markers)
- ✅ Video Export (FFmpeg integration with trim support)
- ✅ Screen Recording (AVFoundation capture - macOS only)
- ✅ Audio Recording (microphone + system audio with BlackHole)
- ✅ Audio Settings Modal (device selection, quality presets)
- ✅ Dual Audio Mixing (FFmpeg amerge filter)
- ✅ Graceful Recording Stop (proper exit code handling)

**Next Steps**:
1. Bundle FFmpeg with app for easier distribution
2. Test cross-platform recording (Windows/Linux)
3. Implement multi-clip concatenation
4. Add keyboard shortcuts and progress indicators
5. Audio waveform visualization
6. Picture-in-picture combo recording
