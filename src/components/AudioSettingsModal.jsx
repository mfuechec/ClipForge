import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AudioSettingsModal.css';

function AudioSettingsModal({ isOpen, onClose, onStartRecording, recordingMode }) {
  const [audioDevices, setAudioDevices] = useState([]);
  const [audioSettings, setAudioSettings] = useState({
    microphoneEnabled: true,
    microphoneDevice: 'default',
    systemAudioEnabled: false,
    systemAudioDevice: 'none',
    audioQuality: 'standard', // 'standard', 'high', 'voice'
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load available audio devices when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAudioDevices();
    }
  }, [isOpen]);

  const loadAudioDevices = async () => {
    try {
      setIsLoading(true);
      const devices = await invoke('list_audio_devices');
      // Filter out any devices with error messages or invalid data
      const validDevices = devices.filter(d =>
        d.id && d.name && !d.name.toLowerCase().includes('error')
      );
      setAudioDevices(validDevices.length > 0 ? validDevices : [
        { id: '0', name: 'Default Microphone', type: 'input' }
      ]);
    } catch (error) {
      console.error('Failed to load audio devices:', error);
      // Fallback to default device
      setAudioDevices([{ id: '0', name: 'Default Microphone', type: 'input' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStart = () => {
    onStartRecording(recordingMode, audioSettings);
    onClose();
  };

  if (!isOpen) return null;

  const getModeIcon = () => {
    switch (recordingMode) {
      case 'screen': return '🖥️';
      case 'webcam': return '📹';
      case 'combo': return '🎬';
      default: return '⏺';
    }
  };

  const getModeTitle = () => {
    switch (recordingMode) {
      case 'screen': return 'Screen Recording';
      case 'webcam': return 'Webcam Recording';
      case 'combo': return 'Screen + Webcam';
      default: return 'Recording';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <span className="mode-icon-large">{getModeIcon()}</span>
            {getModeTitle()} Settings
          </h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Detecting audio devices...</p>
            </div>
          ) : (
            <>
              {/* Microphone Settings */}
              <div className="settings-section">
                <div className="section-header">
                  <h3>🎤 Microphone</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={audioSettings.microphoneEnabled}
                      onChange={(e) => setAudioSettings({
                        ...audioSettings,
                        microphoneEnabled: e.target.checked
                      })}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {audioSettings.microphoneEnabled && (
                  <div className="setting-item">
                    <label>Microphone Device</label>
                    <select
                      value={audioSettings.microphoneDevice}
                      onChange={(e) => setAudioSettings({
                        ...audioSettings,
                        microphoneDevice: e.target.value
                      })}
                      className="device-select"
                    >
                      <option value="default">Default Microphone</option>
                      {audioDevices
                        .filter(d => d.type === 'input')
                        .map(device => (
                          <option key={device.id} value={device.id}>
                            {device.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* System Audio Settings */}
              <div className="settings-section">
                <div className="section-header">
                  <h3>🔊 System Audio</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={audioSettings.systemAudioEnabled}
                      onChange={(e) => setAudioSettings({
                        ...audioSettings,
                        systemAudioEnabled: e.target.checked
                      })}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {audioSettings.systemAudioEnabled && (
                  <div className="setting-item">
                    <label>System Audio Source</label>
                    <select
                      value={audioSettings.systemAudioDevice}
                      onChange={(e) => setAudioSettings({
                        ...audioSettings,
                        systemAudioDevice: e.target.value
                      })}
                      className="device-select"
                    >
                      <option value="none">Select audio source...</option>
                      {audioDevices
                        .filter(d => d.type === 'output' || d.type === 'virtual')
                        .map(device => (
                          <option key={device.id} value={device.id}>
                            {device.name}
                          </option>
                        ))}
                    </select>
                    <p className="help-text">
                      ℹ️ System audio requires a virtual audio device like BlackHole or Soundflower
                    </p>
                  </div>
                )}
              </div>

              {/* Audio Quality Settings */}
              <div className="settings-section">
                <div className="section-header">
                  <h3>🎵 Audio Quality</h3>
                </div>

                <div className="quality-options">
                  <label className={`quality-option ${audioSettings.audioQuality === 'voice' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="audioQuality"
                      value="voice"
                      checked={audioSettings.audioQuality === 'voice'}
                      onChange={(e) => setAudioSettings({
                        ...audioSettings,
                        audioQuality: e.target.value
                      })}
                    />
                    <div className="quality-details">
                      <div className="quality-title">Voice</div>
                      <div className="quality-desc">64 kbps • Optimized for speech</div>
                    </div>
                  </label>

                  <label className={`quality-option ${audioSettings.audioQuality === 'standard' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="audioQuality"
                      value="standard"
                      checked={audioSettings.audioQuality === 'standard'}
                      onChange={(e) => setAudioSettings({
                        ...audioSettings,
                        audioQuality: e.target.value
                      })}
                    />
                    <div className="quality-details">
                      <div className="quality-title">Standard</div>
                      <div className="quality-desc">128 kbps • Balanced quality</div>
                    </div>
                  </label>

                  <label className={`quality-option ${audioSettings.audioQuality === 'high' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="audioQuality"
                      value="high"
                      checked={audioSettings.audioQuality === 'high'}
                      onChange={(e) => setAudioSettings({
                        ...audioSettings,
                        audioQuality: e.target.value
                      })}
                    />
                    <div className="quality-details">
                      <div className="quality-title">High</div>
                      <div className="quality-desc">256 kbps • Best quality</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Audio Preview/Warning */}
              {!audioSettings.microphoneEnabled && !audioSettings.systemAudioEnabled && (
                <div className="warning-box">
                  ⚠️ No audio sources enabled. Your recording will have no sound.
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-start-recording"
            onClick={handleStart}
            disabled={isLoading}
          >
            ⏺ Start Recording
          </button>
        </div>
      </div>
    </div>
  );
}

export default AudioSettingsModal;
