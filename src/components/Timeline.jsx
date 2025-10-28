import { useRef, useState, useEffect } from 'react';
import './Timeline.css';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTimeline } from '../TimelineContext';
import { getSegmentColor } from './TranscriptPanel';

// Draggable Timeline Clip Block
function DraggableTimelineClip({
  timelineClip,
  clip,
  getPixelWidth,
  formatTime,
  onClipSelect,
  isSelected,
  onTimelineClipSelect,
  isTrimMode,
  renamingClipId,
  onRename
}) {
  const { toggleAudioLink, toggleVideoMute, toggleAudioMute } = useTimeline();
  const [renameValue, setRenameValue] = useState('');
  const isRenaming = renamingClipId === timelineClip.id;

  // Initialize rename value when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      console.log('[Timeline] Entering rename mode for clip:', timelineClip.id);
      setRenameValue(timelineClip.customName || clip.filename);
    } else {
      setRenameValue('');
    }
  }, [isRenaming, timelineClip.customName, clip.filename]);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: timelineClip.id,
    data: {
      type: 'timeline-clip',
      timelineClipId: timelineClip.id,
      clipIndex: timelineClip.clipIndex
    },
    disabled: isTrimMode || isRenaming // Disable dragging when in trim mode or renaming
  });

  // Use timeline clip's trim points (not source clip's)
  const clipDuration = (timelineClip.trimEnd != null && timelineClip.trimStart != null)
    ? timelineClip.trimEnd - timelineClip.trimStart
    : clip.duration;

  const style = {
    left: `${getPixelWidth(timelineClip.startTime)}px`,
    width: `${getPixelWidth(clipDuration)}px`,
    opacity: isDragging ? 0.5 : 1,
    cursor: isTrimMode ? 'crosshair' : (isRenaming ? 'text' : (isDragging ? 'grabbing' : 'grab'))
  };

  const handleClick = () => {
    if (isRenaming) return; // Don't select while renaming
    // Update media library selection to this clip
    if (onClipSelect) {
      onClipSelect(timelineClip.clipIndex);
    }
    // Set this as the selected timeline clip
    if (onTimelineClipSelect) {
      onTimelineClipSelect(timelineClip.id);
    }
  };

  const handleRenameSubmit = (e) => {
    e.preventDefault();
    if (onRename) {
      onRename(timelineClip.id, renameValue.trim());
    }
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (onRename) {
        onRename(null, ''); // Cancel rename
      }
    }
  };

  const displayName = timelineClip.customName || clip.filename;

  console.log('[Timeline] Rendering clip:', timelineClip.id, 'isRenaming:', isRenaming, 'renameValue:', renameValue);

  return (
    <div
      ref={setNodeRef}
      key={timelineClip.id}
      className={`timeline-clip-block ${isSelected ? 'selected' : ''} ${isTrimMode ? 'trim-mode' : ''} ${isRenaming ? 'renaming' : ''}`}
      style={style}
      onClick={handleClick}
      {...(!isTrimMode && !isRenaming ? listeners : {})}
      {...(!isTrimMode && !isRenaming ? attributes : {})}
    >
      <div className="clip-block-content">
        {isRenaming ? (
          <form onSubmit={handleRenameSubmit} style={{ width: '100%' }}>
            <input
              type="text"
              className="clip-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameSubmit}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </form>
        ) : (
          <>
            <div className="clip-block-name">{displayName}</div>
            {isSelected && (
              <div className="clip-controls" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`clip-control-btn ${timelineClip.isAudioLinked ? '' : 'active'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAudioLink(timelineClip.id);
                  }}
                  title={timelineClip.isAudioLinked ? "Unlink audio" : "Link audio"}
                >
                  {timelineClip.isAudioLinked ? '🔗' : '🔓'}
                </button>
                <button
                  className={`clip-control-btn ${timelineClip.isVideoMuted ? 'muted' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVideoMute(timelineClip.id);
                  }}
                  title={timelineClip.isVideoMuted ? "Unmute video" : "Mute video"}
                >
                  {timelineClip.isVideoMuted ? '🚫' : '🎬'}
                </button>
                <button
                  className={`clip-control-btn ${timelineClip.isAudioMuted ? 'muted' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAudioMute(timelineClip.id);
                  }}
                  title={timelineClip.isAudioMuted ? "Unmute audio" : "Mute audio"}
                >
                  {timelineClip.isAudioMuted ? '🔇' : '🔊'}
                </button>
              </div>
            )}
          </>
        )}
        <div className="clip-block-duration">{formatTime(clipDuration)}</div>
      </div>
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

// Draggable Audio Clip (for independent audio dragging when unlinked)
function DraggableAudioClip({
  timelineClip,
  clip,
  getPixelWidth,
  waveform,
  isSelected
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `audio-${timelineClip.id}`,
    data: {
      type: 'audio-clip',
      timelineClipId: timelineClip.id
    },
    disabled: timelineClip.isAudioLinked // Only draggable when unlinked
  });

  // Use audio-specific trim values if they exist, otherwise fall back to video trim
  const audioTrimStart = timelineClip.audioTrimStart ?? timelineClip.trimStart ?? 0;
  const audioTrimEnd = timelineClip.audioTrimEnd ?? timelineClip.trimEnd ?? clip.duration;
  const audioDuration = audioTrimEnd - audioTrimStart;

  // Calculate audio position: base startTime + audioOffset when unlinked
  const audioPosition = timelineClip.startTime + (timelineClip.isAudioLinked ? 0 : timelineClip.audioOffset);

  const style = {
    position: 'absolute',
    left: `${getPixelWidth(audioPosition)}px`,
    width: `${getPixelWidth(audioDuration)}px`,
    height: '100%',
    top: 0,
    opacity: isDragging ? 0.5 : 1,
    cursor: timelineClip.isAudioLinked ? 'default' : (isDragging ? 'grabbing' : 'grab'),
    border: isSelected && !timelineClip.isAudioLinked ? '2px solid #8b5cf6' : undefined
  };

  return (
    <div
      ref={setNodeRef}
      key={`audio-${timelineClip.id}`}
      className="audio-clip-block"
      style={style}
      {...(!timelineClip.isAudioLinked ? listeners : {})}
      {...(!timelineClip.isAudioLinked ? attributes : {})}
    >
      {waveform && waveform.length > 0 ? (
        <svg
          width="100%"
          height="100%"
          style={{ display: 'block' }}
          preserveAspectRatio="none"
        >
          {(() => {
            // Calculate which portion of the waveform to show based on audio trim
            const totalDuration = clip.duration;
            const startRatio = audioTrimStart / totalDuration;
            const endRatio = audioTrimEnd / totalDuration;
            const startIndex = Math.floor(startRatio * waveform.length);
            const endIndex = Math.ceil(endRatio * waveform.length);
            const trimmedWaveform = waveform.slice(startIndex, endIndex);

            return trimmedWaveform.map((amplitude, i) => {
              const x = (i / trimmedWaveform.length) * 100;
              const height = amplitude * 80;
              return (
                <rect
                  key={i + startIndex}
                  x={`${x}%`}
                  y={`${50 - height / 2}%`}
                  width={`${100 / trimmedWaveform.length}%`}
                  height={`${height}%`}
                  fill={timelineClip.isAudioMuted ? '#ef4444' : '#8b5cf6'}
                  opacity={timelineClip.isAudioMuted ? 0.3 : 0.7}
                />
              );
            });
          })()}
        </svg>
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          color: '#666'
        }}>
          Generating waveform...
        </div>
      )}
    </div>
  );
}

function Timeline({
  clips,
  onClipSelect,
  selectedClipIndex,
  selectedTimelineClipId,
  onTimelineClipSelect,
  isTrimMode = false,
  trimStartTime = null,
  trimModeType = 'both',
  isClipMode = false,
  clipStartTime = null,
  transcriptSegments = [],
  transcriptClipPath = null,
  transcriptCollapsed = true,
  selectedSegmentIndex = null,
  onSegmentSelect,
  renamingClipId = null,
  onStartRename,
  onCompleteRename,
  waveformsByPath = {}
}) {
  const { timelineClips, playheadTime, totalDuration } = useTimeline();

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

  return (
    <div className="timeline">
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
        isTrimMode={isTrimMode}
        trimStartTime={trimStartTime}
        trimModeType={trimModeType}
        isClipMode={isClipMode}
        clipStartTime={clipStartTime}
        transcriptSegments={transcriptSegments}
        transcriptClipPath={transcriptClipPath}
        transcriptCollapsed={transcriptCollapsed}
        selectedSegmentIndex={selectedSegmentIndex}
        onSegmentSelect={onSegmentSelect}
        renamingClipId={renamingClipId}
        onCompleteRename={onCompleteRename}
        waveformsByPath={waveformsByPath}
      />
    </div>
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
  onTimelineClipSelect,
  isTrimMode,
  trimStartTime,
  trimModeType,
  isClipMode,
  clipStartTime,
  transcriptSegments,
  transcriptClipPath,
  transcriptCollapsed,
  selectedSegmentIndex,
  onSegmentSelect,
  renamingClipId,
  onCompleteRename,
  waveformsByPath
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
          <p>Timeline is empty. Drag clips from the media library to get started.</p>
        </div>
      ) : (
        <div className="timeline-track-container" onClick={handleTimelineClick}>
          {/* Dual Track Layout */}
          <div className="timeline-dual-tracks">
            {/* Video Track */}
            <div className="timeline-track-row">
              <div className="track-label">VIDEO</div>
              <div
                ref={trackRef}
                className="timeline-track video-track"
                style={{ width: `${Math.max(800, getPixelWidth(totalDuration))}px` }}
              >
            {/* Transcript Segment Overlays - Only show when transcript panel is open */}
            {!transcriptCollapsed && transcriptSegments.length > 0 && timelineClips.length > 0 && transcriptClipPath && (
              <div className="transcript-segments-overlay">
                {timelineClips.map((timelineClip) => {
                  const clip = clips[timelineClip.clipIndex];
                  if (!clip) return null;

                  // Only show segments for clips that match the transcript source
                  if (clip.path !== transcriptClipPath) return null;

                  const trimStart = timelineClip.trimStart ?? 0;
                  const trimEnd = timelineClip.trimEnd ?? clip.duration;

                  return transcriptSegments.map((segment, index) => {
                    // Only show segments that fall within this clip's trim range
                    if (segment.start >= trimEnd || segment.end <= trimStart) {
                      return null;
                    }

                    // Calculate segment position relative to timeline
                    const segmentStartInClip = Math.max(segment.start, trimStart);
                    const segmentEndInClip = Math.min(segment.end, trimEnd);
                    const segmentStartOnTimeline = timelineClip.startTime + (segmentStartInClip - trimStart);
                    const segmentEndOnTimeline = timelineClip.startTime + (segmentEndInClip - trimStart);

                    const segmentColor = getSegmentColor(index, transcriptSegments.length);
                    const isSelected = index === selectedSegmentIndex;

                    return (
                      <div
                        key={`${timelineClip.id}-${index}`}
                        className={`timeline-transcript-segment ${isSelected ? 'selected' : ''}`}
                        style={{
                          left: `${getPixelWidth(segmentStartOnTimeline)}px`,
                          width: `${getPixelWidth(segmentEndOnTimeline - segmentStartOnTimeline)}px`,
                          backgroundColor: segmentColor,
                          opacity: isSelected ? 0.6 : 0.3,
                          borderColor: segmentColor
                        }}
                        onClick={() => onSegmentSelect && onSegmentSelect(index)}
                        title={`${segment.text.substring(0, 50)}...`}
                      />
                    );
                  });
                })}
              </div>
            )}

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
                  isTrimMode={isTrimMode}
                  renamingClipId={renamingClipId}
                  onRename={onCompleteRename}
                />
              );
            })}

            {/* Trim Selection Overlay - shown when trim mode is active */}
            {isTrimMode && trimStartTime !== null && (
              <div
                className="trim-selection-region"
                style={{
                  left: `${getPixelWidth(Math.min(trimStartTime, playheadTime))}px`,
                  width: `${getPixelWidth(Math.abs(playheadTime - trimStartTime))}px`
                }}
              >
                <div className="trim-selection-label">
                  {trimModeType === 'audio-only' ? '🎵 Audio Trim' : '✂️ Remove'}: {formatTime(Math.abs(playheadTime - trimStartTime))}
                </div>
              </div>
            )}

            {/* Clip Selection Overlay - shown when clip mode is active */}
            {isClipMode && clipStartTime !== null && (
              <div
                className="clip-selection-region"
                style={{
                  left: `${getPixelWidth(Math.min(clipStartTime, playheadTime))}px`,
                  width: `${getPixelWidth(Math.abs(playheadTime - clipStartTime))}px`
                }}
              >
                <div className="clip-selection-label">
                  Extract: {formatTime(Math.abs(playheadTime - clipStartTime))}
                </div>
              </div>
            )}

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

        {/* Audio Track */}
        <div className="timeline-track-row">
          <div className="track-label">AUDIO</div>
          <div
            className="timeline-track audio-track"
            style={{ width: `${Math.max(800, getPixelWidth(totalDuration))}px` }}
          >
            {/* Audio waveforms - draggable when unlinked */}
            {timelineClips.map((tc) => {
              const clip = clips[tc.clipIndex];
              if (!clip) return null;

              const waveform = waveformsByPath[clip.path];
              const isSelected = tc.id === selectedTimelineClipId;

              return (
                <DraggableAudioClip
                  key={`audio-${tc.id}`}
                  timelineClip={tc}
                  clip={clip}
                  getPixelWidth={getPixelWidth}
                  waveform={waveform}
                  isSelected={isSelected}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
      )}
    </div>
  );
}

export default Timeline;
