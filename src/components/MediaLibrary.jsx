import { useDraggable, useDroppable } from '@dnd-kit/core';

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Individual draggable media item
function DraggableMediaItem({ clip, index, isSelected, onSelect, onDelete }) {
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
      className={`media-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(index)}
      {...listeners}
      {...attributes}
    >
      <div className="media-thumbnail">
        🎬
      </div>
      <div className="media-info">
        <div className="media-name" title={clip.filename}>
          {clip.filename}
        </div>
        <div className="media-duration">
          {formatDuration(clip.duration)}
        </div>
      </div>
      <button
        className="media-delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(index);
        }}
        title="Delete clip"
      >
        🗑️
      </button>
    </div>
  );
}

function MediaLibrary({
  clips,
  selectedClipIndex,
  onClipSelect,
  onDeleteClip,
  collapsed,
  onToggleCollapse
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
                  onDelete={onDeleteClip}
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
