function formatTimestamp(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function TranscriptPanel({
  segments = [],
  currentTime = 0,
  onSeek,
  collapsed,
  onToggleCollapse,
  onTranscribe,
  isTranscribing = false,
  hasVideo = false
}) {
  // Find the active segment based on current time
  const getActiveSegmentIndex = () => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].time) {
        return i;
      }
    }
    return -1;
  };

  const activeIndex = getActiveSegmentIndex();

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
              segments.map((segment, index) => (
                <div
                  key={index}
                  className={`transcript-segment ${index === activeIndex ? 'active' : ''}`}
                  onClick={() => onSeek && onSeek(segment.time)}
                >
                  <span className="timestamp">{formatTimestamp(segment.time)}</span>
                  <p>{segment.text}</p>
                </div>
              ))
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
