import React, { useState } from 'react';
import './TextOverlayEditor.css';

const POSITION_PRESETS = {
  'top-left': { x: '10', y: '10', label: 'Top Left' },
  'top-center': { x: '(w-text_w)/2', y: '10', label: 'Top Center' },
  'top-right': { x: 'w-text_w-10', y: '10', label: 'Top Right' },
  'middle-left': { x: '10', y: '(h-text_h)/2', label: 'Middle Left' },
  'center': { x: '(w-text_w)/2', y: '(h-text_h)/2', label: 'Center' },
  'middle-right': { x: 'w-text_w-10', y: '(h-text_h)/2', label: 'Middle Right' },
  'bottom-left': { x: '10', y: 'h-text_h-10', label: 'Bottom Left' },
  'bottom-center': { x: '(w-text_w)/2', y: 'h-text_h-10', label: 'Bottom Center' },
  'bottom-right': { x: 'w-text_w-10', y: 'h-text_h-10', label: 'Bottom Right' },
};

const TextOverlayEditor = ({ overlay, onSave, onClose }) => {
  const [text, setText] = useState(overlay?.text || '');
  const [position, setPosition] = useState(overlay?.position || 'bottom-center');
  const [fontSize, setFontSize] = useState(overlay?.fontSize || 48);
  const [fontColor, setFontColor] = useState(overlay?.fontColor || 'white');
  const [boxEnabled, setBoxEnabled] = useState(overlay?.boxEnabled ?? true);
  const [boxColor, setBoxColor] = useState(overlay?.boxColor || 'black@0.5');
  const [boxBorderWidth, setBoxBorderWidth] = useState(overlay?.boxBorderWidth || 5);

  const handleSave = () => {
    const preset = POSITION_PRESETS[position];
    onSave({
      text,
      position,
      x_position: preset.x,
      y_position: preset.y,
      font_size: fontSize,
      font_color: fontColor,
      box_enabled: boxEnabled,
      box_color: boxEnabled ? boxColor : null,
      box_border_width: boxEnabled ? boxBorderWidth : null,
    });
  };

  const handleRemove = () => {
    onSave(null);
  };

  return (
    <div className="text-overlay-editor-backdrop" onClick={onClose}>
      <div className="text-overlay-editor" onClick={(e) => e.stopPropagation()}>
        <h2>Text Overlay</h2>

        <div className="form-group">
          <label>Text</label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text to display..."
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Position</label>
          <div className="position-grid">
            {Object.entries(POSITION_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                className={`position-btn ${position === key ? 'active' : ''}`}
                onClick={() => setPosition(key)}
                title={preset.label}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Font Size: {fontSize}px</label>
          <input
            type="range"
            min="12"
            max="120"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label>Text Color</label>
          <div className="color-presets">
            {['white', 'black', 'red', 'blue', 'green', 'yellow'].map((color) => (
              <button
                key={color}
                className={`color-btn ${fontColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setFontColor(color)}
                title={color}
              />
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={boxEnabled}
              onChange={(e) => setBoxEnabled(e.target.checked)}
            />
            Background Box
          </label>
        </div>

        {boxEnabled && (
          <>
            <div className="form-group">
              <label>Box Opacity</label>
              <div className="opacity-presets">
                {[
                  { value: 'black@0.3', label: '30%' },
                  { value: 'black@0.5', label: '50%' },
                  { value: 'black@0.7', label: '70%' },
                  { value: 'black@0.9', label: '90%' },
                ].map((option) => (
                  <button
                    key={option.value}
                    className={`opacity-btn ${boxColor === option.value ? 'active' : ''}`}
                    onClick={() => setBoxColor(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Border Width: {boxBorderWidth}px</label>
              <input
                type="range"
                min="0"
                max="20"
                value={boxBorderWidth}
                onChange={(e) => setBoxBorderWidth(Number(e.target.value))}
              />
            </div>
          </>
        )}

        <div className="button-group">
          {overlay && (
            <button className="remove-btn" onClick={handleRemove}>
              Remove Overlay
            </button>
          )}
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="save-btn" onClick={handleSave} disabled={!text}>
            {overlay ? 'Update' : 'Add'} Overlay
          </button>
        </div>
      </div>
    </div>
  );
};

export default TextOverlayEditor;
