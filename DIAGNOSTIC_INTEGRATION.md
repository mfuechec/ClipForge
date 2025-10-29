# 🔧 Diagnostic Tools Integration Guide

This guide shows you exactly how to integrate the sync diagnostic tools into your ClipForge app.

## Files Created

✅ The following diagnostic files have been created:
- `src/utils/syncDiagnostics.js` - Core diagnostic measurement engine
- `src/components/SyncDiagnosticsPanel.jsx` - Interactive UI panel
- `src/components/SyncDiagnosticsPanel.css` - Panel styling
- `SYNC_DIAGNOSTIC_GUIDE.md` - Comprehensive testing guide

## Integration Steps

### Step 1: Update App.jsx (Add Diagnostic Panel)

Add the import at the top of `src/App.jsx`:

```jsx
// Add this import after line 11 (after TimelineProvider import)
import SyncDiagnosticsPanel from './components/SyncDiagnosticsPanel';
```

Add the panel before the closing `</DndContext>` tag:

```jsx
// In AppContent function, find the line with </DndContext> (around line 1630)
// Add this BEFORE the </DndContext> closing tag:

      </DragOverlay>

      {/* Sync Diagnostic Panel - Only in Development */}
      {import.meta.env.DEV && <SyncDiagnosticsPanel />}

    </div>
    </DndContext>
```

**Complete patch for App.jsx:**

```diff
  import TranscriptPanel from './components/TranscriptPanel';
  import { TimelineProvider, useTimeline } from './TimelineContext';
  import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
+ import SyncDiagnosticsPanel from './components/SyncDiagnosticsPanel';

  function AppContent({ clips, setClips }) {
    // ... existing code ...

    return (
      <DndContext ...>
        {/* ... existing components ... */}

        </DragOverlay>
+
+       {/* Sync Diagnostic Panel - Only in Development */}
+       {import.meta.env.DEV && <SyncDiagnosticsPanel />}
+
      </div>
      </DndContext>
    );
  }
```

### Step 2: Update VideoPlayer (Enable Diagnostics Mode)

The VideoPlayer component has already been updated with:
- ✅ `enableDiagnostics` prop added
- ✅ AudioContext exposed to window for diagnostics

Now update your VideoPlayer usage in `src/App.jsx` (around line 1534):

```jsx
<VideoPlayer
  videoPath={playingClip?.path}
  onTimeUpdate={handleTimelineTimeUpdate}
  currentTime={playingClipTime}
  onVideoLoaded={handleVideoLoaded}
  trimStart={playingTrimStart}
  trimEnd={playingTrimEnd}
  audioSegments={playingAudioSegments}
  isVideoMuted={playingIsVideoMuted}
  isAudioMuted={playingIsAudioMuted}
  enableDiagnostics={import.meta.env.DEV}  // Add this line
/>
```

**Complete patch:**

```diff
  <VideoPlayer
    videoPath={playingClip?.path}
    onTimeUpdate={handleTimelineTimeUpdate}
    currentTime={playingClipTime}
    onVideoLoaded={handleVideoLoaded}
    trimStart={playingTrimStart}
    trimEnd={playingTrimEnd}
    audioSegments={playingAudioSegments}
    isVideoMuted={playingIsVideoMuted}
    isAudioMuted={playingIsAudioMuted}
+   enableDiagnostics={import.meta.env.DEV}
  />
```

### Step 3: Verify Integration

1. **Start the app in development mode**:
   ```bash
   npm run tauri:dev
   ```

2. **Look for the diagnostic button**:
   - A blue "🔬 Sync Diagnostics" button should appear in the bottom-right corner

3. **Load a video** and click the button to open the panel

4. **Run a test** to confirm everything works

---

## Quick Test After Integration

1. Record a 30-second video using ClipForge
2. Add it to the timeline and play it
3. Click "🔬 Sync Diagnostics" button
4. Click "🚀 Run Full Suite"
5. Wait for results (tests 1x, 1.5x, 2x speeds)
6. Review the report

**Expected Results:**

### If Using Web Audio API (Current Implementation)
```
TEST AT 1.0x SPEED
Average Drift: ~2 ms/s (Good)
✅ Sync acceptable at 1x

TEST AT 1.5x SPEED
Average Drift: ~500 ms/s (CRITICAL)
❌ Web Audio API does NOT respect playbackRate
🔧 SOLUTION: Switch to native HTML5 audio

TEST AT 2.0x SPEED
Average Drift: ~1000 ms/s (CRITICAL)
❌ Same issue at 2x speed
```

This confirms the Web Audio API playback rate bug.

### After Fixing (Native Audio)
```
TEST AT 1.0x SPEED
Average Drift: ~1 ms/s (Excellent)

TEST AT 1.5x SPEED
Average Drift: ~2 ms/s (Excellent)

TEST AT 2.0x SPEED
Average Drift: ~5 ms/s (Good)
```

Perfect sync at all playback rates! ✅

---

## Alternative: Manual Console Testing

If you prefer not to use the UI panel, you can test from browser console:

1. Open DevTools (`Cmd+Option+I` or `Ctrl+Shift+I`)
2. Run in console:
   ```javascript
   // 10-second test at 1.5x speed
   runSyncTest(10, 1.5);
   ```
3. Wait for the report to print
4. Export data:
   ```javascript
   window.__lastSyncDiagnostics.exportMeasurements();
   ```

---

## Production Build

The diagnostic tools are automatically excluded from production builds:

```jsx
{import.meta.env.DEV && <SyncDiagnosticsPanel />}
```

This ensures:
- ✅ No diagnostic code in production bundle
- ✅ No performance overhead for users
- ✅ Only available during development

---

## Troubleshooting

### "No video element found"
**Cause**: VideoPlayer not mounted or no video loaded
**Fix**: Load a video first, then run diagnostics

### "AudioContext not available"
**Cause**: `enableDiagnostics` prop not set on VideoPlayer
**Fix**: Add `enableDiagnostics={import.meta.env.DEV}` to VideoPlayer

### "Drift undefined"
**Cause**: Not enough measurements collected
**Fix**: Increase test duration to at least 5 seconds

### Button not visible
**Cause**: CSS z-index conflict or production mode
**Fix**: Verify you're in development mode (`npm run tauri:dev`)

---

## Next Steps

After running diagnostics and confirming the issue:

1. **Review results** in the diagnostic panel
2. **Read SYNC_DIAGNOSTIC_GUIDE.md** for detailed interpretation
3. **Decide on fix approach**:
   - Option 1: Native HTML5 audio (recommended) ⭐
   - Option 2: Dual-path audio system
   - Option 3: Increase FFmpeg buffers (if recording issue)
4. **Request implementation** from Winston the Architect

---

## Questions?

If you need help:
1. Run the full diagnostic suite
2. Copy the complete report
3. Include it when asking for help
4. Mention your playback rate and recording mode

Winston (the Architect) can help interpret results and implement fixes! 🏗️
