import { useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import AudioSettingsModal from './AudioSettingsModal';
import './RecordingControls.css';

function RecordingControls({ onRecordingComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState(null); // 'screen', 'webcam', 'combo'
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const timerRef = useRef(null);
  const recordingPathRef = useRef(null);

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start timer
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  }, []);

  // Stop timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Handle mode selection - open audio settings modal
  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    setShowModeSelector(false);
    setShowAudioModal(true);
  };

  // Handle recording start with audio settings
  const handleStartRecording = async (mode, audioSettings) => {
    try {
      setRecordingMode(mode);

      // Generate temporary file path - recording will be saved to temp location
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const tempFilename = `clipforge-${mode}-${timestamp}.mov`;

      // Use system temp directory (cross-platform)
      const tempPath = `/tmp/${tempFilename}`; // macOS/Linux
      // TODO: For Windows, we'd use process.env.TEMP or similar

      recordingPathRef.current = tempPath;

      // Start recording via Rust backend with audio settings
      // Note: Using FFmpeg for all modes
      await invoke('start_recording', {
        options: {
          mode,
          output_path: tempPath,
          audio_settings: {
            microphone_enabled: audioSettings.microphoneEnabled,
            microphone_device: audioSettings.microphoneDevice,
            system_audio_enabled: audioSettings.systemAudioEnabled,
            system_audio_device: audioSettings.systemAudioDevice,
            audio_quality: audioSettings.audioQuality,
          }
        }
      });

      setIsRecording(true);
      startTimer();
      console.log(`Started ${mode} recording to: ${tempPath}`, audioSettings);
    } catch (error) {
      console.error('Recording error:', error);
      alert(`Failed to start recording: ${error}`);
      setRecordingMode(null);
      recordingPathRef.current = null;
    }
  };

  // Stop recording
  const handleStopRecording = async () => {
    try {
      await invoke('stop_recording');

      stopTimer();
      setIsRecording(false);
      setRecordingTime(0);

      // Auto-import the recording
      if (recordingPathRef.current && onRecordingComplete) {
        onRecordingComplete(recordingPathRef.current);
      }

      setRecordingMode(null);
      recordingPathRef.current = null;

      console.log('Recording stopped successfully');
    } catch (error) {
      console.error('Error stopping recording:', error);
      alert(`Failed to stop recording: ${error}`);
    }
  };

  return (
    <div className="recording-controls">
      {!isRecording ? (
        <div className="record-button-container">
          <button
            className="btn-record"
            onClick={() => setShowModeSelector(!showModeSelector)}
          >
            <span className="record-icon">⏺</span> Record
          </button>

          {showModeSelector && (
            <div className="recording-mode-dropdown">
              <button
                className="mode-option"
                onClick={() => handleModeSelect('screen')}
              >
                <span className="mode-icon">🖥️</span>
                <div className="mode-details">
                  <div className="mode-title">Screen</div>
                  <div className="mode-desc">Record your screen</div>
                </div>
              </button>
              <button
                className="mode-option"
                onClick={() => handleModeSelect('webcam')}
              >
                <span className="mode-icon">📹</span>
                <div className="mode-details">
                  <div className="mode-title">Webcam</div>
                  <div className="mode-desc">Record from camera</div>
                </div>
              </button>
              <button
                className="mode-option"
                onClick={() => handleModeSelect('combo')}
              >
                <span className="mode-icon">🎬</span>
                <div className="mode-details">
                  <div className="mode-title">Screen + Webcam</div>
                  <div className="mode-desc">Record both (PiP style)</div>
                </div>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="recording-active">
          <div className="recording-indicator">
            <span className="recording-dot"></span>
            <span className="recording-label">Recording {recordingMode}</span>
            <span className="recording-time">{formatTime(recordingTime)}</span>
          </div>
          <div className="recording-actions">
            <button
              className="btn-stop-record"
              onClick={handleStopRecording}
            >
              ⏹️ Stop Recording
            </button>
          </div>
        </div>
      )}

      {/* Audio Settings Modal */}
      <AudioSettingsModal
        isOpen={showAudioModal}
        onClose={() => setShowAudioModal(false)}
        onStartRecording={handleStartRecording}
        recordingMode={selectedMode}
      />
    </div>
  );
}

export default RecordingControls;
