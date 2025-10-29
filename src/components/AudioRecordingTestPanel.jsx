import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AudioRecordingTestPanel.css';

export default function AudioRecordingTestPanel() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMethod, setRecordingMethod] = useState('standard');
  const [testResults, setTestResults] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const [currentRecordingPath, setCurrentRecordingPath] = useState(null);
  const [isBatchRecording, setIsBatchRecording] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, method: '' });

  const recordingMethods = {
    standard: {
      name: 'Standard FFmpeg',
      description: 'FFmpeg with current settings',
      settings: {
        use_wallclock_as_timestamps: true,
        audio_filter: 'aresample=async=1:first_pts=0',
        rtbufsize: '100M',
        thread_queue_size: 2048
      }
    },
    minimal: {
      name: 'Minimal FFmpeg',
      description: 'Bare minimum FFmpeg parameters',
      settings: {
        use_wallclock_as_timestamps: false,
        audio_filter: '',
        rtbufsize: '50M',
        thread_queue_size: 1024
      }
    },
    highBuffer: {
      name: 'High Buffer FFmpeg',
      description: 'Increased buffer sizes',
      settings: {
        use_wallclock_as_timestamps: true,
        audio_filter: 'aresample=async=1:first_pts=0',
        rtbufsize: '200M',
        thread_queue_size: 4096
      }
    },
    strictSync: {
      name: 'Strict Sync FFmpeg',
      description: 'Force sync with video timestamps',
      settings: {
        use_wallclock_as_timestamps: false,
        audio_filter: 'aresample=async=1000:first_pts=0',
        rtbufsize: '100M',
        thread_queue_size: 2048
      }
    },
    noAsync: {
      name: 'No Async Resample FFmpeg',
      description: 'Remove async audio resampling',
      settings: {
        use_wallclock_as_timestamps: true,
        audio_filter: '',
        rtbufsize: '100M',
        thread_queue_size: 2048
      }
    }
  };

  const startTestRecording = async () => {
    const method = recordingMethods[recordingMethod];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPath = `/tmp/audio_test_${recordingMethod}_${timestamp}.mp4`;

    setIsRecording(true);
    setCurrentRecordingPath(outputPath);

    try {
      // Start recording with test settings
      await invoke('start_test_recording', {
        options: {
          mode: 'screen',
          output_path: outputPath,
          audio_settings: {
            microphone_enabled: true,
            microphone_device: ':0',
            system_audio_enabled: false,
            system_audio_device: '',
            audio_quality: 'standard'
          },
          test_settings: method.settings
        }
      });

      console.log('[AudioTest] Started recording with method:', recordingMethod);
      console.log('[AudioTest] Output path:', outputPath);

      // Record for 5 seconds
      setTimeout(async () => {
        try {
          const result = await invoke('stop_recording');
          console.log('[AudioTest] Recording stopped:', result);

          // Wait a moment for file to be fully written
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Analyze the recording using the stored path
          const analysis = await analyzeRecording(outputPath);

          setTestResults([
            ...testResults,
            {
              method: method.name,
              timestamp: new Date().toLocaleTimeString(),
              path: outputPath,
              analysis
            }
          ]);

          setIsRecording(false);
          setCurrentRecordingPath(null);
        } catch (error) {
          console.error('[AudioTest] Failed to stop recording:', error);
          setIsRecording(false);
          setCurrentRecordingPath(null);
        }
      }, 5000);
    } catch (error) {
      console.error('[AudioTest] Failed to start test recording:', error);
      alert(`Test recording failed: ${error}`);
      setIsRecording(false);
      setCurrentRecordingPath(null);
    }
  };

  const analyzeRecording = async (videoPath) => {
    try {
      // Get basic metadata
      const metadata = await invoke('import_video', { path: videoPath });

      // Generate waveform to check audio quality
      const waveform = await invoke('generate_waveform', {
        videoPath,
        samples: 100
      });

      // Calculate audio statistics
      const avgAmplitude = waveform.reduce((a, b) => a + b, 0) / waveform.length;
      const maxAmplitude = Math.max(...waveform);
      const silentSamples = waveform.filter(v => v < 0.01).length;

      return {
        duration: metadata.duration,
        avgAmplitude: avgAmplitude.toFixed(3),
        maxAmplitude: maxAmplitude.toFixed(3),
        silentPercentage: ((silentSamples / waveform.length) * 100).toFixed(1)
      };
    } catch (error) {
      console.error('[AudioTest] Failed to analyze recording:', error);
      return { error: error.toString() };
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const startBatchRecording = async () => {
    setIsBatchRecording(true);
    const methods = Object.keys(recordingMethods);
    const batchResults = [];

    console.log('[AudioTest] Starting batch recording for', methods.length, 'methods');

    for (let i = 0; i < methods.length; i++) {
      const methodKey = methods[i];
      const method = recordingMethods[methodKey];

      setBatchProgress({ current: i + 1, total: methods.length, method: method.name });
      console.log(`[AudioTest] Recording method ${i + 1}/${methods.length}: ${method.name}`);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const outputPath = `/tmp/audio_test_${methodKey}_${timestamp}.mp4`;

      try {
        // Start recording
        await invoke('start_test_recording', {
          options: {
            mode: 'screen',
            output_path: outputPath,
            audio_settings: {
              microphone_enabled: true,
              microphone_device: ':0',
              system_audio_enabled: false,
              system_audio_device: '',
              audio_quality: 'standard'
            },
            test_settings: method.settings
          }
        });

        console.log('[AudioTest] Started recording:', method.name);

        // Wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Stop recording
        await invoke('stop_recording');
        console.log('[AudioTest] Stopped recording:', method.name);

        // Wait for file to be written
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Analyze
        const analysis = await analyzeRecording(outputPath);

        batchResults.push({
          method: method.name,
          timestamp: new Date().toLocaleTimeString(),
          path: outputPath,
          analysis
        });

        console.log(`[AudioTest] Completed ${method.name}:`, analysis);
      } catch (error) {
        console.error(`[AudioTest] Failed to record ${method.name}:`, error);
        batchResults.push({
          method: method.name,
          timestamp: new Date().toLocaleTimeString(),
          path: outputPath,
          analysis: { error: error.toString() }
        });
      }

      // Small pause between recordings
      if (i < methods.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setTestResults([...testResults, ...batchResults]);
    setIsBatchRecording(false);
    setBatchProgress({ current: 0, total: 0, method: '' });
    console.log('[AudioTest] Batch recording complete. Total results:', batchResults.length);
  };

  if (collapsed) {
    return (
      <div className="audio-test-panel collapsed">
        <button
          className="expand-btn"
          onClick={() => setCollapsed(false)}
          title="Show Audio Recording Test Panel"
        >
          🎤 Audio Tests
        </button>
      </div>
    );
  }

  return (
    <div className="audio-test-panel">
      <div className="panel-header">
        <h3>🎤 Audio Recording Test Panel</h3>
        <button
          className="collapse-btn"
          onClick={() => setCollapsed(true)}
          title="Hide panel"
        >
          ✕
        </button>
      </div>

      <div className="test-controls">
        <div className="method-selector">
          <label htmlFor="recording-method">Recording Method:</label>
          <select
            id="recording-method"
            value={recordingMethod}
            onChange={(e) => setRecordingMethod(e.target.value)}
            disabled={isRecording}
          >
            {Object.entries(recordingMethods).map(([key, method]) => (
              <option key={key} value={key}>
                {method.name}
              </option>
            ))}
          </select>
        </div>

        <div className="method-description">
          {recordingMethods[recordingMethod].description}
        </div>

        <div className="method-settings">
          <strong>Settings:</strong>
          <ul>
            {Object.entries(recordingMethods[recordingMethod].settings).map(([key, value]) => (
              <li key={key}>
                <code>{key}</code>: {value.toString()}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
          <button
            className="test-btn"
            onClick={startTestRecording}
            disabled={isRecording || isBatchRecording}
          >
            {isRecording ? '⏺️ Recording (5s)...' : '⏺️ Start 5s Test Recording'}
          </button>

          <button
            className="test-btn batch-btn"
            onClick={startBatchRecording}
            disabled={isRecording || isBatchRecording}
          >
            {isBatchRecording
              ? `⏺️ Recording ${batchProgress.current}/${batchProgress.total}: ${batchProgress.method}...`
              : '🎯 Test All Methods (5 recordings)'}
          </button>
        </div>
      </div>

      {isBatchRecording && (
        <div className="batch-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            Recording method {batchProgress.current} of {batchProgress.total}...
            <br />
            <small>Keep speaking or playing audio for consistent test conditions</small>
          </div>
        </div>
      )}

      {testResults.length > 0 && (
        <div className="test-results">
          <div className="results-header">
            <h4>Test Results ({testResults.length})</h4>
            <button className="clear-btn" onClick={clearResults}>
              Clear
            </button>
          </div>

          <div className="results-list">
            {testResults.map((result, index) => (
              <div key={index} className="result-item">
                <div className="result-header">
                  <strong>{result.method}</strong>
                  <span className="timestamp">{result.timestamp}</span>
                </div>
                <div className="result-path">
                  <code>{result.path}</code>
                </div>
                {result.analysis.error ? (
                  <div className="result-error">Error: {result.analysis.error}</div>
                ) : (
                  <div className="result-stats">
                    <div className="stat">
                      <span className="stat-label">Duration:</span>
                      <span className="stat-value">{result.analysis.duration}s</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Avg Amplitude:</span>
                      <span className="stat-value">{result.analysis.avgAmplitude}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Max Amplitude:</span>
                      <span className="stat-value">{result.analysis.maxAmplitude}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Silent %:</span>
                      <span className="stat-value">{result.analysis.silentPercentage}%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel-footer">
        <small>
          💡 Tip: Test different methods and compare audio quality/sync. Results saved to /tmp
        </small>
      </div>
    </div>
  );
}
