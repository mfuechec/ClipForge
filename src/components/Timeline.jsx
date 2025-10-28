import { useRef, useState } from 'react';
import './Timeline.css';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useTimeline } from '../TimelineContext';

// Draggable Media Library Item
function DraggableMediaClip({ clip, index, isSelected, onSelect, formatTime }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `media-clip-${index}`,
    data: { type: 'media-clip', clipIndex: index }
  });

  const style = {
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`library-clip ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect && onSelect(index)}
      {...listeners}
      {...attributes}
    >
      <div className="clip-info">
        <div className="clip-name">{clip.filename}</div>
        <div className="clip-meta">
          {clip.duration ? formatTime(clip.duration) : '--:--'}
          {clip.width && ` • ${clip.width}×${clip.height}`}
        </div>
      </div>
    </div>
  );
}

// Droppable Media Library
function MediaLibraryDroppable({ clips, selectedClipIndex, onClipSelect, formatTime }) {
  const { setNodeRef } = useDroppable({
    id: 'media-library'
  });

  return (
    <div ref={setNodeRef} className="media-library">
      {clips.length === 0 ? (
        <div className="library-empty">
          <p>No clips imported. Click "Import Video" to get started.</p>
        </div>
      ) : (
        <div className="library-clips">
          {clips.map((clip, index) => (
            <DraggableMediaClip
              key={index}
              clip={clip}
              index={index}
              isSelected={index === selectedClipIndex}
              onSelect={onClipSelect}
              formatTime={formatTime}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Draggable Timeline Clip Block
function DraggableTimelineClip({ timelineClip, clip, getPixelWidth, formatTime, onClipSelect, isSelected, onTimelineClipSelect }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: timelineClip.id,
    data: {
      type: 'timeline-clip',
      timelineClipId: timelineClip.id,
      clipIndex: timelineClip.clipIndex
    }
  });

  const clipDuration = (clip.trimEnd != null && clip.trimStart != null)
    ? clip.trimEnd - clip.trimStart
    : clip.duration;

  const style = {
    left: `${getPixelWidth(timelineClip.startTime)}px`,
    width: `${getPixelWidth(clipDuration)}px`,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab'
  };

  const handleClick = () => {
    // Update media library selection to this clip
    if (onClipSelect) {
      onClipSelect(timelineClip.clipIndex);
    }
    // Set this as the selected timeline clip
    if (onTimelineClipSelect) {
      onTimelineClipSelect(timelineClip.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      key={timelineClip.id}
      className={`timeline-clip-block ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
      {...listeners}
      {...attributes}
    >
      <div className="clip-block-content">
        <div className="clip-block-name">{clip.filename}</div>
        <div className="clip-block-duration">{formatTime(clipDuration)}</div>
      </div>

      {/* Trim indicators - only show if actually trimmed */}
      {(clip.trimStart != null && clip.trimStart > 0) ||
       (clip.trimEnd != null && clip.trimEnd < clip.duration) ? (
        <div className="clip-trimmed-badge">Trimmed</div>
      ) : null}
    </div>
  );
}

// Draggable Playhead
function DraggablePlayhead({ playheadTime, getPixelWidth }) {
  const { seekPlayhead } = useTimeline();
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: 'playhead',
    data: { type: 'playhead' }
  });

  // Calculate position - DON'T use transform during drag because we're updating
  // playheadTime via seekPlayhead in onDragMove. Using transform would cause double movement.
  const baseLeft = getPixelWidth(playheadTime);

  const style = {
    left: `${baseLeft}px`,
    cursor: isDragging ? 'grabbing' : 'ew-resize',
    // No transition - position updates are controlled by state changes, not CSS
    transition: 'none'
  };

  return (
    <div
      ref={setNodeRef}
      className="playhead"
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="playhead-line" />
      <div className="playhead-handle" />
    </div>
  );
}

function Timeline({
  clips,
  onClipSelect,
  selectedClipIndex,
  selectedTimelineClipId,
  onTimelineClipSelect
}) {
  const { timelineClips, playheadTime, totalDuration, addClipToTimeline, removeClipFromTimeline, seekPlayhead } = useTimeline();
  const timelineTrackRef = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const dragStartTimeRef = useRef(0);

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // Require 8px of movement before drag starts (prevents accidental drags)
      }
    })
  );

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate pixel width for a given duration (200px per 10 seconds)
  const getPixelWidth = (duration) => {
    const pixelsPerSecond = 20; // 20px per second = 200px per 10s
    return duration * pixelsPerSecond;
  };

  // Handle drag start - track what's being dragged
  const handleDragStart = (event) => {
    setActiveId(event.active.id);

    // Store initial playhead time when starting to drag playhead
    if (event.active.data.current?.type === 'playhead') {
      dragStartTimeRef.current = playheadTime;
    }
  };

  // Handle drag move - update playhead position in real-time
  const handleDragMove = (event) => {
    const { active, delta } = event;
    const dragType = active.data.current?.type;

    // Handle playhead dragging - update in real-time
    if (dragType === 'playhead') {
      const pixelsPerSecond = 20;
      const timeDelta = delta.x / pixelsPerSecond;
      // Use the stored start time, not current playhead time
      const newTime = Math.max(0, Math.min(dragStartTimeRef.current + timeDelta, totalDuration));
      seekPlayhead(newTime);
    }
  };

  // Handle drag end - add clip to timeline or seek playhead
  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over, delta } = event;

    const dragType = active.data.current?.type;

    // Handle playhead dragging - final position already set by onDragMove
    if (dragType === 'playhead') {
      return;
    }

    // Handle media clip dragging to timeline
    if (dragType === 'media-clip' && over?.id === 'timeline-track') {
      const clipIndex = active.data.current.clipIndex;
      const clip = clips[clipIndex];

      if (!clip || !clip.duration) {
        alert('Please wait for the clip to load before adding to timeline');
        return;
      }

      // Append to the end of the timeline (sequential arrangement)
      // Pass clips array to ensure fresh data
      addClipToTimeline(clipIndex, null, clips);
      return;
    }

    // Handle timeline clip dragging to nowhere (remove from timeline)
    if (dragType === 'timeline-clip' && !over) {
      const timelineClipId = active.data.current.timelineClipId;
      console.log('[Timeline] Removing clip from timeline (dragged to nowhere):', timelineClipId);
      removeClipFromTimeline(timelineClipId);
      return;
    }

    // Handle timeline clip dragging back to media library (remove from timeline)
    if (dragType === 'timeline-clip' && over?.id === 'media-library') {
      const timelineClipId = active.data.current.timelineClipId;
      console.log('[Timeline] Removing clip from timeline (dragged to library):', timelineClipId);
      removeClipFromTimeline(timelineClipId);
      return;
    }
  };

  // Get the active dragged item data
  const getActiveItem = () => {
    if (!activeId) return null;

    // Check if it's a media clip
    if (activeId.startsWith('media-clip-')) {
      const index = parseInt(activeId.replace('media-clip-', ''));
      return { type: 'media-clip', clip: clips[index], index };
    }

    // Check if it's a timeline clip
    const timelineClip = timelineClips.find(tc => tc.id === activeId);
    if (timelineClip) {
      return { type: 'timeline-clip', clip: clips[timelineClip.clipIndex], timelineClip };
    }

    return null;
  };

  const activeItem = getActiveItem();

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
      <div className="timeline">
        {/* Media Library Section */}
        <MediaLibraryDroppable
          clips={clips}
          selectedClipIndex={selectedClipIndex}
          onClipSelect={onClipSelect}
          formatTime={formatTime}
        />

        {/* Timeline Track Section */}
        <TimelineTrackDroppable
          timelineClips={timelineClips}
          clips={clips}
          totalDuration={totalDuration}
          playheadTime={playheadTime}
          getPixelWidth={getPixelWidth}
          formatTime={formatTime}
          onClipSelect={onClipSelect}
          selectedTimelineClipId={selectedTimelineClipId}
          onTimelineClipSelect={onTimelineClipSelect}
        />
      </div>

      {/* Drag Overlay - shows preview of dragged item */}
      <DragOverlay>
        {activeItem && (
          <div className="drag-overlay-preview">
            <div className="clip-name">{activeItem.clip?.filename}</div>
            {activeItem.clip?.duration && (
              <div className="clip-meta">{formatTime(activeItem.clip.duration)}</div>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Droppable Timeline Track
function TimelineTrackDroppable({
  timelineClips,
  clips,
  totalDuration,
  playheadTime,
  getPixelWidth,
  formatTime,
  onClipSelect,
  selectedTimelineClipId,
  onTimelineClipSelect
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'timeline-track'
  });
  const { seekPlayhead } = useTimeline();
  const trackRef = useRef(null);

  const style = {
    backgroundColor: isOver ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
  };

  // Handle click-to-seek on timeline
  const handleTimelineClick = (e) => {
    // Ignore clicks on playhead or clips
    if (e.target.closest('.playhead') ||
        e.target.closest('.timeline-clip-block')) {
      return;
    }

    // Only handle clicks directly on the timeline track
    if (e.target.classList.contains('timeline-track') ||
        e.target.classList.contains('timeline-track-container')) {
      const trackElement = trackRef.current;
      if (!trackElement) return;

      const rect = trackElement.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pixelsPerSecond = 20;
      const clickTime = Math.max(0, Math.min(clickX / pixelsPerSecond, totalDuration));

      seekPlayhead(clickTime);
    }
  };

  return (
    <div className="timeline-track-section" ref={setNodeRef} style={style}>
      {timelineClips.length === 0 ? (
        <div className="timeline-empty">
          <p>Timeline is empty. Drag clips from the media library above.</p>
        </div>
      ) : (
        <div className="timeline-track-container" onClick={handleTimelineClick}>
          <div
            ref={trackRef}
            className="timeline-track"
            style={{ width: `${Math.max(800, getPixelWidth(totalDuration))}px` }}
          >
            {/* Playhead */}
            {totalDuration > 0 && (
              <DraggablePlayhead
                playheadTime={playheadTime}
                getPixelWidth={getPixelWidth}
              />
            )}

            {/* Timeline Clips */}
            {timelineClips.map((tc) => {
              const clip = clips[tc.clipIndex];
              if (!clip) return null;

              return (
                <DraggableTimelineClip
                  key={tc.id}
                  timelineClip={tc}
                  clip={clip}
                  getPixelWidth={getPixelWidth}
                  formatTime={formatTime}
                  onClipSelect={onClipSelect}
                  isSelected={tc.id === selectedTimelineClipId}
                  onTimelineClipSelect={onTimelineClipSelect}
                />
              );
            })}

            {/* Time Markers */}
            <div className="time-markers">
              {Array.from({ length: Math.ceil(totalDuration / 10) + 1 }, (_, i) => i * 10).map((time) => (
                <div
                  key={time}
                  className="time-marker"
                  style={{ left: `${getPixelWidth(time)}px` }}
                >
                  <div className="marker-tick" />
                  <div className="marker-label">{formatTime(time)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Timeline;
