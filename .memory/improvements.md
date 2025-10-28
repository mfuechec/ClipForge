# ClipForge Improvements

## Drag and Drop Timeline Enhancements
- **Position-based insertion**: Clips dropped on the timeline are now inserted at the drop position instead of always going to the end
- **Clip reordering**: Timeline clips can be dragged within the timeline to reorder them
- **Smart insertion logic**: Uses clip midpoints to determine insertion index
- **Context updates**:
  - `addClipToTimeline()` now accepts optional `insertAtIndex` parameter
  - `reorderTimelineClips()` now uses index-based positioning with proper reflow

## Layout Improvements
- **Full-width timeline**: Timeline now spans entire bottom of screen (grid-column: 1 / -1)
- **Fixed timeline height**: Timeline maintains constant 280px height regardless of transcript panel state
- **No overlap**: Side panels (media library and transcript) only occupy row 2, not extending into timeline area

## Video Player Controls
- **Keyboard shortcuts**:
  - Spacebar: Play/pause video
  - Left/Right arrows: Frame-by-frame navigation (1/30s per frame for precision editing)
- **Seamless speed changes**: Playback rate changes now preserve playing state without pausing
- **Removed custom controls**: Users now use Video.js built-in controls exclusively

## Timeline Operations
- **Merge timeline**: New button combines all timeline clips into a single merged clip
  - Automatically clears timeline and replaces with merged clip
  - Merged clip added to media library
  - Silent operation (no notification)
- **Silent operations**: Removed unnecessary alerts from:
  - Delete clip (now immediate)
  - Recording complete (clips added silently to library)
  - Timeline merge (seamless operation)

## Technical Implementation
- **Drop position tracking**: Uses `currentDragPositionRef` to track mouse position during drag
- **Insertion calculation**: `calculateInsertionIndex()` helper converts mouse position to timeline time to determine clip placement
- **Frame-accurate seeking**: Arrow keys move by exactly 1/30th of a second for precise editing
- **State preservation**: Playback rate changes now check and restore playing state
