function formatTimestamp(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Generate color for segment index using HSL
function getSegmentColor(index, total) {
  // Use distinct hues across the color wheel, avoiding red (playhead color)
  // Start at 180° (cyan) and distribute across 280° to avoid red (0°) region
  const hue = (180 + (index * 280 / Math.max(total, 1))) % 360;
  const saturation = 70;
  const lightness = 60;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function TranscriptPanel({
  segments = [],
  currentTime = 0,
  onSeek,
  collapsed,
  onToggleCollapse,
  onTranscribe,
  isTranscribing = false,
  hasVideo = false,
  selectedSegmentIndex = null,
  onSegmentSelect
}) {
  // Find the active segment based on current time (playing position)
  const getActiveSegmentIndex = () => {
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i];
      // Check if current time is within segment range [start, end)
      if (currentTime >= segment.start && currentTime < segment.end) {
        return i;
      }
    }
    return -1;
  };

  const activeIndex = getActiveSegmentIndex();

  const handleSegmentClick = (segment, index) => {
    // Seek to segment start
    if (onSeek) {
      onSeek(segment.start);
    }
    // Update selected segment
    if (onSegmentSelect) {
      onSegmentSelect(index);
    }
  };

  return (
    <div className={`transcript-panel ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && (
        <>
          <div className="panel-header">
            <h3>Transcript</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {segments.length === 0 && (
                <button
                  className="btn-primary"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={onTranscribe}
                  disabled={isTranscribing}
                  title="Generate AI transcript using OpenAI Whisper"
                >
                  {isTranscribing ? '⏳ Transcribing...' : '🤖 Transcribe'}
                </button>
              )}
              <button
                className="btn-secondary"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                onClick={onToggleCollapse}
                title="Collapse panel"
              >
                ▶
              </button>
            </div>
          </div>

          <div className="transcript-content">
            {segments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <div className="empty-state-text">
                  No transcript available.<br />
                  Add clips to timeline to see transcript.
                </div>
              </div>
            ) : (
              segments.map((segment, index) => {
                const segmentColor = getSegmentColor(index, segments.length);
                const isActive = index === activeIndex;
                const isSelected = index === selectedSegmentIndex;

                return (
                  <div
                    key={index}
                    className={`transcript-segment ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${segment.isFiller ? 'filler' : ''}`}
                    onClick={() => handleSegmentClick(segment, index)}
                    style={{
                      borderLeftColor: segmentColor,
                      '--segment-color': segmentColor
                    }}
                  >
                    <span className="timestamp">{formatTimestamp(segment.start)}</span>
                    <p>{segment.text}</p>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {collapsed && (
        <button
          className="panel-collapse-btn right"
          onClick={onToggleCollapse}
          title="Show transcript"
        >
          ◀
        </button>
      )}
    </div>
  );
}

export default TranscriptPanel;
export { getSegmentColor };
