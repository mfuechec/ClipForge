import { useRef, useState } from 'react';
import './Timeline.css';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useTimeline } from '../TimelineContext';

// Draggable Media Library Item
function DraggableMediaClip({ clip, index, isSelected, onSelect, onAddToTimeline, formatTime }) {
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
      <button
        className="btn-add-timeline"
        onClick={(e) => {
          e.stopPropagation();
          onAddToTimeline && onAddToTimeline(index);
        }}
        disabled={!clip.duration}
      >
        + Add
      </button>
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

  // Calculate position with transform applied during drag
  const baseLeft = getPixelWidth(playheadTime);
  const currentLeft = transform ? baseLeft + transform.x : baseLeft;

  const style = {
    left: `${currentLeft}px`,
    cursor: isDragging ? 'grabbing' : 'ew-resize'
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
  onAddToTimeline,
  selectedClipIndex
}) {
  const { timelineClips, playheadTime, totalDuration, addClipToTimeline, seekPlayhead } = useTimeline();
  const timelineTrackRef = useRef(null);

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

  // Handle drag end - add clip to timeline or seek playhead
  const handleDragEnd = (event) => {
    const { active, over, delta } = event;

    const dragType = active.data.current?.type;

    // Handle playhead dragging
    if (dragType === 'playhead') {
      const pixelsPerSecond = 20;
      const timeDelta = delta.x / pixelsPerSecond;
      const newTime = Math.max(0, Math.min(playheadTime + timeDelta, totalDuration));
      seekPlayhead(newTime);
      return;
    }

    // Handle clip dragging to timeline
    if (dragType === 'media-clip' && over?.id === 'timeline-track') {
      const clipIndex = active.data.current.clipIndex;
      const clip = clips[clipIndex];

      if (!clip || !clip.duration) {
        alert('Please wait for the clip to load before adding to timeline');
        return;
      }

      // For now, just append to the end of the timeline
      // TODO: Calculate precise drop position based on mouse coordinates
      // Pass clips array to ensure fresh data
      addClipToTimeline(clipIndex, null, clips);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="timeline">
        {/* Media Library Section */}
        <div className="media-library">
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
                  onAddToTimeline={onAddToTimeline}
                  formatTime={formatTime}
                />
              ))}
            </div>
          )}
        </div>

        {/* Timeline Track Section */}
        <TimelineTrackDroppable
          timelineClips={timelineClips}
          clips={clips}
          totalDuration={totalDuration}
          playheadTime={playheadTime}
          getPixelWidth={getPixelWidth}
          formatTime={formatTime}
          onClipSelect={onClipSelect}
        />
      </div>
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
  onClipSelect
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
    // Only handle clicks directly on the timeline track, not on clips or playhead
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

              const clipDuration = (clip.trimEnd != null && clip.trimStart != null)
                ? clip.trimEnd - clip.trimStart
                : clip.duration;

              return (
                <div
                  key={tc.id}
                  className="timeline-clip-block"
                  style={{
                    left: `${getPixelWidth(tc.startTime)}px`,
                    width: `${getPixelWidth(clipDuration)}px`
                  }}
                  onClick={() => onClipSelect && onClipSelect(tc.clipIndex)}
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
