import './Timeline.css';

function Timeline({
  clips,
  timelineClips,
  onClipSelect,
  onAddToTimeline,
  selectedClipIndex,
  playheadTime,
  totalDuration
}) {
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
      {/* Media Library Section */}
      <div className="media-library">
        <div className="section-header">
          <h3>Media Library</h3>
          <span className="clip-count">{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
        </div>

        {clips.length === 0 ? (
          <div className="library-empty">
            <p>No clips imported. Click "Import Video" to get started.</p>
          </div>
        ) : (
          <div className="library-clips">
            {clips.map((clip, index) => (
              <div
                key={index}
                className={`library-clip ${index === selectedClipIndex ? 'selected' : ''}`}
                onClick={() => onClipSelect && onClipSelect(index)}
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
            ))}
          </div>
        )}
      </div>

      {/* Timeline Track Section */}
      <div className="timeline-track-section">
        <div className="section-header">
          <h3>Timeline</h3>
          <span className="timeline-duration">
            {formatTime(playheadTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        {timelineClips.length === 0 ? (
          <div className="timeline-empty">
            <p>Timeline is empty. Add clips from the media library above.</p>
          </div>
        ) : (
          <div className="timeline-track-container">
            <div className="timeline-track" style={{ width: `${Math.max(800, getPixelWidth(totalDuration))}px` }}>
              {/* Playhead */}
              {totalDuration > 0 && (
                <div
                  className="playhead"
                  style={{ left: `${getPixelWidth(playheadTime)}px` }}
                >
                  <div className="playhead-line" />
                  <div className="playhead-handle" />
                </div>
              )}

              {/* Timeline Clips */}
              {timelineClips.map((tc, index) => {
                const clip = clips[tc.clipIndex];
                if (!clip) return null;

                const clipDuration = clip.trimEnd && clip.trimStart
                  ? clip.trimEnd - clip.trimStart
                  : clip.duration;

                return (
                  <div
                    key={index}
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

                    {/* Trim indicators */}
                    {(clip.trimStart !== null || clip.trimEnd !== null) && (
                      <div className="clip-trimmed-badge">Trimmed</div>
                    )}
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
    </div>
  );
}

export default Timeline;
