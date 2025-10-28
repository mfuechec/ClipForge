# Drag & Drop Timeline Features - Testing Guide

## ✅ Implemented Features

### 1. **Drag Media Clips to Timeline**
**How it works:**
- Each clip in the Media Library (top section) is draggable
- Drag any clip down to the Timeline section below
- Drop it on the timeline to add it
- Currently appends to the end of the timeline

**How to test:**
1. Import or record a video
2. Click and drag the clip from the Media Library
3. Drag it down to the Timeline track section (bottom)
4. Release to drop - clip should appear on the timeline

### 2. **Timeline-Driven Playback**
**How it works:**
- When clips are on the timeline, the video player plays the timeline composition
- The player automatically switches between clips as the playhead crosses boundaries
- Empty timeline = plays selected clip from library
- Timeline with clips = plays timeline composition

**How to test:**
1. Add multiple clips to the timeline
2. Click play in the video player
3. Watch the player automatically transition between clips
4. The playhead should move across the timeline as video plays

### 3. **Draggable Playhead Scrubbing**
**How it works:**
- The red playhead marker on the timeline is draggable
- Drag it left/right to scrub through your video
- Video player seeks to the corresponding position
- Automatically switches to the correct clip at that position

**How to test:**
1. Add clips to the timeline
2. Find the red playhead marker (vertical line with handle on top)
3. Click and drag the playhead left or right
4. Video should seek to that position
5. If you cross a clip boundary, video source should switch

### 4. **Click-to-Seek on Timeline**
**How it works:**
- Click anywhere on the timeline track (gray background area)
- Playhead jumps to that position
- Video seeks to that time

**How to test:**
1. Add clips to the timeline
2. Click anywhere on the gray timeline track area
3. Playhead should jump to that position
4. Video should seek to that time

### 5. **Visual Feedback**
**What you should see:**
- **Dragging media clips:** Clip becomes semi-transparent (50% opacity)
- **Hovering over timeline:** Timeline gets a blue highlight (subtle)
- **Dragging playhead:** Cursor changes to resize cursor (↔)
- **Timeline clips:** Show filename, duration, and trim status

## 🔧 Technical Details

### State Management
- Uses React Context (`TimelineContext`) for timeline state
- Shared state: `timelineClips`, `playheadTime`, `totalDuration`
- Functions: `addClipToTimeline()`, `seekPlayhead()`, `getActiveClipAtTime()`

### Drag & Drop Library
- Uses `@dnd-kit/core` for drag-and-drop functionality
- Sensors configured with 8px activation distance (prevents accidental drags)
- Separate drag types: `media-clip` and `playhead`

### Timeline Scale
- 20 pixels per second
- Time markers every 10 seconds
- Minimum timeline width: 800px
- Expands based on total duration

## 🐛 Known Limitations

### Current Behavior:
1. **Drop position:** Media clips dropped on timeline are appended to the end (not dropped at cursor position)
2. **Clip removal:** No way to remove clips from timeline yet
3. **Clip reordering:** Can't drag clips within the timeline to reorder them
4. **Trim from timeline:** Can only trim clips from library, not directly on timeline
5. **Playback during drag:** Video doesn't pause while dragging playhead

### Why These Are OK for MVP:
- Core functionality works: drag from library, timeline playback, scrubbing
- Can still build complete videos using these features
- Advanced features can be added incrementally

## 🔍 Debugging Tips

### If dragging doesn't work:
- Check browser console for errors
- Make sure @dnd-kit packages are installed: `npm list @dnd-kit/core`
- Verify pointer events aren't being blocked by CSS

### If playhead doesn't move:
- Check that timeline has clips (playhead only shows when totalDuration > 0)
- Look for JavaScript errors in console
- Verify TimelineContext is providing seekPlayhead function

### If video doesn't seek:
- Check that VideoPlayer is receiving currentTime prop changes
- Verify getActiveClipAtTime() is returning correct clip
- Check for video.js errors in console

### If video source doesn't switch:
- Verify selectedClipIndex is updating when playhead crosses boundaries
- Check handleTimelineTimeUpdate logic
- Look at VideoPlayer's useEffect for videoPath changes

## 🚀 Future Enhancements

1. **Precise drop positioning** - Calculate exact timeline position from mouse X coordinate
2. **Clip removal** - Delete button or drag-out-to-remove
3. **Timeline reordering** - Drag clips within timeline using @dnd-kit/sortable
4. **Trim handles on timeline** - Adjust in/out points directly on timeline clips
5. **Multi-track support** - Multiple video/audio tracks
6. **Snap-to-grid** - Snap clips and playhead to frame or second boundaries
7. **Keyboard shortcuts** - Space = play/pause, arrows = frame stepping
8. **Visual waveforms** - Audio waveforms on timeline clips

## 📝 Testing Checklist

- [ ] Import a video and drag it to timeline
- [ ] Video appears on timeline track
- [ ] Click play - video plays from timeline
- [ ] Drag playhead - video seeks to that position
- [ ] Click timeline - playhead jumps and video seeks
- [ ] Add multiple clips to timeline
- [ ] Play through multiple clips - should transition smoothly
- [ ] Drag playhead across clip boundary - video source switches
- [ ] Export timeline - should export the composition

## 🎯 Expected User Experience

**New Recording Flow:**
1. Record or import video → appears in Media Library
2. Video is NOT automatically added to timeline
3. User drags clips from library to timeline to build composition
4. Timeline becomes the "working area"
5. Export exports the timeline composition

**Key Difference from Before:**
- **Before:** New recordings auto-added to timeline
- **Now:** User has full control via drag & drop
- **Why:** More flexible editing workflow, build compositions deliberately
