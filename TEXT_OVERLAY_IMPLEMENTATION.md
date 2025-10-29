# Text Overlay Feature Implementation

## Overview
Added text overlay functionality to ClipForge, allowing users to add customizable text overlays to video clips that are burned into the exported video using FFmpeg's drawtext filter.

## Implementation Details

### Backend (Rust - src-tauri/src/lib.rs)

**New Structures:**
- `TextOverlay` struct with fields:
  - `text`: The text to display
  - `x_position`: Horizontal position (supports FFmpeg expressions like "(w-text_w)/2")
  - `y_position`: Vertical position (supports FFmpeg expressions)
  - `font_size`: Font size in pixels
  - `font_color`: Text color
  - `box_enabled`: Whether to show background box
  - `box_color`: Background box color with alpha (e.g., "black@0.5")
  - `box_border_width`: Border width for the box

**Modified Structures:**
- Added `text_overlay: Option<TextOverlay>` field to `ClipSegment` struct

**New Functions:**
- `escape_ffmpeg_text()`: Escapes special characters for FFmpeg drawtext filter
  - Handles: backslash, quotes, colons, percent signs

**Modified Functions:**
- `export_multi_clip()`:
  - Removed single-clip shortcut to ensure all clips go through the same processing pipeline
  - Integrated drawtext filter into video filter chain
  - Uses Arial font from macOS system fonts: `/System/Library/Fonts/Supplemental/Arial.ttf`
  - Applies text overlay before final video output

**FFmpeg Integration:**
- Text overlay added to filter_complex chain
- Applied after video processing but before encoding
- Format: `drawtext=text='...':fontfile=...:fontsize=...:fontcolor=...:x=...:y=...:box=...:boxcolor=...:boxborderw=...`

### Frontend

**New Components:**

1. **TextOverlayEditor.jsx**
   - Modal dialog for configuring text overlays
   - Features:
     - Text input field
     - 9-position grid (top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right)
     - Font size slider (12-120px)
     - 6 color presets (white, black, red, blue, green, yellow)
     - Background box toggle
     - Box opacity selector (30%, 50%, 70%, 90%)
     - Border width slider (0-20px)
     - Remove overlay button
   - Position presets use FFmpeg expressions for centering:
     - Center X: `(w-text_w)/2`
     - Center Y: `(h-text_h)/2`
     - Bottom: `h-text_h-10`
     - Right: `w-text_w-10`

2. **TextOverlayEditor.css**
   - Dark theme styling
   - Grid layout for position selector
   - Color picker buttons
   - Slider controls

**Modified Components:**

1. **TimelineContext.jsx**
   - Added `textOverlay` field to timeline clip state
   - New function: `updateTextOverlay(timelineClipId, textOverlay)`
   - Text overlays preserved when splitting clips
   - Text overlay set to null for audio-only clips

2. **Timeline.jsx**
   - Added "T" button to clip controls when clip is selected
   - Button highlights when overlay is active
   - Opens TextOverlayEditor modal on click
   - Integrated modal with state management
   - Props passed through: `onTextOverlayClick`

3. **App.jsx**
   - Added `text_overlay` field to clip segments in both:
     - `handleMergeTimeline()` - for merging timeline
     - `handleExportVideo()` - for exporting timeline
   - Fixed modal stuck issue by:
     - Adding 5-second timeout to import step in merge
     - Clearing `mergeProgress` state in both merge and export finally blocks
   - Merge still imports resulting clip back to library (with timeout)
   - Export shows success alert without import

## User Workflow

1. Add clip to timeline and select it
2. Click "T" button on selected clip
3. Configure text overlay:
   - Enter text
   - Choose position from 9-grid
   - Adjust font size
   - Select text color
   - Toggle background box (optional)
   - Adjust box opacity and border (if enabled)
4. Click "Add Overlay" or "Update Overlay"
5. Export or merge timeline
6. Text is burned into the exported video

## Technical Notes

**Font Rendering:**
- Uses Arial font from macOS system fonts
- Text overlay rendered by FFmpeg during export
- Not visible in preview (only in exported video)

**Preview Limitation:**
- Text overlays only appear in exported video, not in live preview
- This is by design for MVP - avoids complex canvas rendering or repeated FFmpeg calls

**Modal Progress:**
- Backend emits `merge-progress` events for both merge and export operations
- Global event listener updates modal state
- Both operations now properly clear modal after completion
- Import timeout prevents indefinite hanging

**Position Expressions:**
- FFmpeg drawtext supports expressions for dynamic positioning
- `w` = video width, `h` = video height
- `text_w` = rendered text width, `text_h` = rendered text height
- Allows responsive positioning regardless of video resolution

## Files Modified

**Backend:**
- `src-tauri/src/lib.rs` - Text overlay data structures and FFmpeg integration

**Frontend:**
- `src/components/TextOverlayEditor.jsx` - New component (text overlay UI)
- `src/components/TextOverlayEditor.css` - New stylesheet
- `src/components/Timeline.jsx` - Added overlay button and modal integration
- `src/TimelineContext.jsx` - Added overlay state management
- `src/App.jsx` - Wired up overlay data in export functions, fixed modal issues

## Future Enhancements

Potential improvements for future versions:
- Canvas-based preview overlay for positioning
- Multiple text overlays per clip with timing
- Additional fonts (bundled or system font picker)
- Text animations (fade in/out, slide)
- More styling options (shadows, outlines, gradients)
- Custom positioning with drag-and-drop
- Text templates
- Rich text formatting
