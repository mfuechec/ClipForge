import { useState, useEffect } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { convertFileSrc } from '@tauri-apps/api/core';

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Individual draggable media item
function DraggableMediaItem({ clip, index, isSelected, onSelect, renamingClipIndex, onRename }) {
  const [renameValue, setRenameValue] = useState('');
  const isRenaming = renamingClipIndex === index;

  // Initialize rename value when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      console.log('[MediaLibrary] Entering rename mode for clip:', index);
      setRenameValue(clip.filename);
    } else {
      setRenameValue('');
    }
  }, [isRenaming, clip.filename, index]);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `media-clip-${index}`,
    data: { type: 'media-clip', clipIndex: index },
    disabled: isRenaming // Disable dragging when renaming
  });

  const style = {
    opacity: isDragging ? 0.5 : 1,
    cursor: isRenaming ? 'text' : (isDragging ? 'grabbing' : 'grab')
  };

  const handleClick = () => {
    if (isRenaming) return; // Don't select while renaming
    onSelect(index);
  };

  const handleRenameSubmit = (e) => {
    e.preventDefault();
    if (onRename) {
      onRename(index, renameValue.trim());
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`media-item ${isSelected ? 'selected' : ''} ${isRenaming ? 'renaming' : ''}`}
      onClick={handleClick}
      {...(!isRenaming ? listeners : {})}
      {...(!isRenaming ? attributes : {})}
    >
      <div className="media-thumbnail">
        {clip.thumbnail_path ? (
          <img
            src={convertFileSrc(clip.thumbnail_path)}
            alt={clip.filename}
            onError={(e) => {
              // Fallback to emoji if image fails to load
              e.target.style.display = 'none';
              e.target.parentElement.textContent = '🎬';
            }}
          />
        ) : (
          '🎬'
        )}
      </div>
      <div className="media-info">
        {isRenaming ? (
          <form onSubmit={handleRenameSubmit} style={{ width: '100%' }}>
            <input
              type="text"
              className="media-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameSubmit}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </form>
        ) : (
          <div className="media-name" title={clip.filename}>
            {clip.filename}
          </div>
        )}
        <div className="media-duration">
          {formatDuration(clip.duration)}
        </div>
      </div>
    </div>
  );
}

function MediaLibrary({
  clips,
  selectedClipIndex,
  onClipSelect,
  collapsed,
  onToggleCollapse,
  renamingClipIndex,
  onRename
}) {
  const { setNodeRef } = useDroppable({
    id: 'media-library'
  });

  return (
    <div className={`media-panel ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && (
        <>
          <div className="panel-header">
            <h3>Media Library</h3>
            <button
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '11px' }}
              onClick={onToggleCollapse}
              title="Collapse panel"
            >
              ◀
            </button>
          </div>

          <div ref={setNodeRef} className="media-list">
            {clips.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🎬</div>
                <div className="empty-state-text">
                  No media yet.<br />
                  Import or record to get started.
                </div>
              </div>
            ) : (
              clips.map((clip, index) => (
                <DraggableMediaItem
                  key={index}
                  clip={clip}
                  index={index}
                  isSelected={selectedClipIndex === index}
                  onSelect={onClipSelect}
                  renamingClipIndex={renamingClipIndex}
                  onRename={onRename}
                />
              ))
            )}
          </div>
        </>
      )}

      {collapsed && (
        <button
          className="panel-collapse-btn left"
          onClick={onToggleCollapse}
          title="Show media library"
        >
          ▶
        </button>
      )}
    </div>
  );
}

export default MediaLibrary;
