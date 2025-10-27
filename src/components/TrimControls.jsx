import { useState } from 'react';
import './TrimControls.css';

function TrimControls({
  currentTime,
  duration,
  trimStart,
  trimEnd,
  onSetTrimStart,
  onSetTrimEnd,
  onClearTrim
}) {
  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="trim-controls">
      <div className="trim-controls-inner">
        <button
          className="btn-trim"
          onClick={onSetTrimStart}
          disabled={!duration}
          title="Set start point at current time"
        >
          [ Set In Point
        </button>

        <button
          className="btn-trim"
          onClick={onSetTrimEnd}
          disabled={!duration}
          title="Set end point at current time"
        >
          Set Out Point ]
        </button>

        <button
          className="btn-trim btn-clear"
          onClick={onClearTrim}
          disabled={trimStart === null && trimEnd === null}
          title="Clear trim points"
        >
          Clear Trim
        </button>

        {(trimStart !== null || trimEnd !== null) && (
          <div className="trim-info">
            <span className="trim-badge">
              {trimStart !== null && `In: ${formatTime(trimStart)}`}
            </span>
            {trimStart !== null && trimEnd !== null && <span className="separator">→</span>}
            <span className="trim-badge">
              {trimEnd !== null && `Out: ${formatTime(trimEnd)}`}
            </span>
            {trimStart !== null && trimEnd !== null && (
              <span className="trim-badge duration">
                Duration: {formatTime(trimEnd - trimStart)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TrimControls;
