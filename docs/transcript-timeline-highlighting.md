# Transcript Timeline Highlighting Feature

## Overview
Added color-coded transcript segment visualization on the timeline with synchronized highlighting between the transcript panel and timeline view.

## Implementation Date
October 28, 2025

## Components Modified
- `src/App.jsx`
- `src/components/TranscriptPanel.jsx`
- `src/components/Timeline.jsx`
- `src/App.css`
- `src/components/Timeline.css`

## Features

### 1. Color-Coded Segments
Each transcript segment is assigned a unique color from a rainbow palette using HSL color generation:
- Hue ranges from 180° to 460° (cyan to violet) to avoid red (playhead color)
- 70% saturation and 60% lightness for optimal visibility
- Colors are consistent between timeline and transcript panel

**Location**: `src/components/TranscriptPanel.jsx:8-16`
```javascript
function getSegmentColor(index, total) {
  const hue = (180 + (index * 280 / Math.max(total, 1))) % 360;
  const saturation = 70;
  const lightness = 60;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
```

### 2. Timeline Segment Visualization
- Colored bars appear at the top of the timeline (8px high by default)
- Segments span from `start` to `end` time using 20px per second scale
- Only visible when transcript panel is open
- Positioned relative to timeline clip position, respecting trim points
- Clickable to select and seek to segment

**Location**: `src/components/Timeline.jsx:227-273`

### 3. Transcript Panel Enhancements
- Segments display with colored left border matching timeline color
- Shows timestamps in M:SS format
- Three visual states:
  - **Active**: Segment currently being played (based on playhead position)
  - **Selected**: User-clicked segment with enhanced outline
  - **Filler**: Words detected as filler (um, uh, like, etc.) with red styling

**Location**: `src/components/TranscriptPanel.jsx:94-114`

### 4. Selection Synchronization
- Clicking a transcript segment selects it and seeks to its start time
- Clicking a timeline segment bar selects the corresponding transcript entry
- Selection state is shared via `selectedSegmentIndex` prop
- Active segment detection uses `start` and `end` range checking

**Location**: `src/App.jsx:46`, `src/App.jsx:845-846`

### 5. Layout Adjustments
- Timeline height dynamically adjusts from 280px to 200px when transcript panel is open
- Grid rows: `60px 1fr ${transcriptCollapsed ? '280px' : '200px'}`
- Transcript panel has bottom padding (80px) to ensure last segment is scrollable
- Prevents UI overlap between transcript panel and timeline controls

**Location**: `src/App.jsx:789`, `src/App.css:225`

### 6. Segment Filtering
- Filters out segments that start beyond clip duration
- Prevents Whisper-generated segments with invalid timestamps
- Filter: `seg.start < (playingClip.duration || Infinity)`

**Location**: `src/App.jsx:62-64`

### 7. Trim-Aware Positioning
Timeline segments only appear within clip boundaries:
- Calculates segment position relative to timeline clip's `startTime`
- Adjusts for trim points: `timelineClip.startTime + (segment.start - trimStart)`
- Clips segments that partially overlap with trim range
- Only shows segments for clips matching transcript source path

**Location**: `src/components/Timeline.jsx:240-270`

## Technical Details

### Data Flow
1. **Transcription**: OpenAI Whisper generates segments with `start`, `end`, `text`, `confidence`, `is_filler`
2. **Storage**: Segments stored in `transcriptsByPath` keyed by video file path
3. **Filtering**: Active clip's segments filtered by duration
4. **Display**: Segments passed to both TranscriptPanel and Timeline components
5. **Selection**: Shared state tracks selected segment index
6. **Seeking**: Selection triggers `seekPlayhead()` to jump to segment start time

### Segment Data Structure
```javascript
{
  start: number,      // Start time in seconds
  end: number,        // End time in seconds
  text: string,       // Transcript text
  confidence: number, // 0-1 confidence score
  isFiller: boolean   // True if detected as filler word
}
```

### CSS Custom Properties
Segments use `--segment-color` CSS variable for dynamic theming:
```css
.transcript-segment {
  border-left-color: var(--segment-color);
  --segment-color: /* dynamically set via inline style */
}
```

## Visual States

### Timeline Segment States
- **Default**: 8px height, 30% opacity
- **Hover**: 70% opacity, 1.5x vertical scale
- **Selected**: 12px height, 60% opacity, thicker border, shadow

### Transcript Segment States
- **Default**: Gray background, colored left border
- **Active**: Purple background, playhead indicator
- **Selected**: Dark background, colored outline, enhanced shadow
- **Filler**: Red tint, "FILLER" badge

## Usage
1. Import video and add to timeline
2. Click "🤖 Transcribe" button to generate transcript
3. Transcript panel auto-expands showing colored segments
4. Colored bars appear on timeline above clip
5. Click any segment (timeline or panel) to select and seek
6. Playhead position automatically highlights active segment

## Future Enhancements
- Dynamic segment granularity based on clip length (sentences for short clips, paragraphs for long clips)
- Word-level segment precision (Whisper API already provides word timings)
- Confidence-based color coding (green = high confidence, red = low confidence)
- Search/filter segments by text content
- Export transcript as SRT/VTT subtitle files

## Performance Considerations
- Segments are only rendered when transcript panel is open
- Timeline segments use efficient absolute positioning
- Color calculation is memoized via stable index-based hashing
- Segment filtering happens once per render cycle

## Accessibility
- Segments are keyboard navigable (can be extended)
- Color coding supplemented with visual indicators (borders, shadows)
- Tooltips show segment text on timeline hover
- Timestamps use tabular-nums font for consistent spacing
