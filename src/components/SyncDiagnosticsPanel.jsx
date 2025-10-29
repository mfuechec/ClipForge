import { useState, useRef } from 'react';
import { SyncDiagnostics } from '../utils/syncDiagnostics';
import './SyncDiagnosticsPanel.css';

/**
 * Diagnostic panel for audio/video sync testing
 *
 * Usage: Add to your main App component:
 *   import SyncDiagnosticsPanel from './components/SyncDiagnosticsPanel';
 *   <SyncDiagnosticsPanel />
 */
function SyncDiagnosticsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [testDuration, setTestDuration] = useState(10);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [report, setReport] = useState('');
  const [status, setStatus] = useState('');

  const diagnosticsRef = useRef(null);
  const timerRef = useRef(null);

  const startTest = () => {
    const videoElement = window.__syncDiagnosticsVideoElement || document.querySelector('video');
    const audioContext = window.__syncDiagnosticsAudioContext;

    if (!videoElement) {
      setStatus('❌ Error: No video element found. Make sure a video is loaded.');
      return;
    }

    if (!videoElement.src) {
      setStatus('❌ Error: Video has no source. Load a video first.');
      return;
    }

    // Create diagnostics instance
    diagnosticsRef.current = new SyncDiagnostics(videoElement, audioContext);

    // Set playback rate
    videoElement.playbackRate = playbackRate;

    // Start playback if paused
    if (videoElement.paused) {
      videoElement.play().catch(err => {
        setStatus(`❌ Error starting playback: ${err.message}`);
        return;
      });
    }

    // Start diagnostics
    diagnosticsRef.current.start();
    setIsRunning(true);
    setReport('');
    setStatus(`🧪 Running ${testDuration}s test at ${playbackRate}x speed...`);

    // Stop after duration
    timerRef.current = setTimeout(() => {
      stopTest();
    }, testDuration * 1000);
  };

  const stopTest = () => {
    if (!diagnosticsRef.current) return;

    clearTimeout(timerRef.current);
    diagnosticsRef.current.stop();

    const generatedReport = diagnosticsRef.current.generateReport();
    setReport(generatedReport);
    setIsRunning(false);
    setStatus('✅ Test complete');

    // Visualize in console
    diagnosticsRef.current.visualizeDrift();

    // Make available for export
    window.__lastSyncDiagnostics = diagnosticsRef.current;
    console.log('💡 To export CSV: window.__lastSyncDiagnostics.exportMeasurements()');
  };

  const exportData = () => {
    if (diagnosticsRef.current) {
      diagnosticsRef.current.exportMeasurements();
      setStatus('✅ Data exported to CSV file');
    }
  };

  const runQuickTests = async () => {
    setStatus('🚀 Running comprehensive test suite...');
    setReport('');

    const rates = [1.0, 1.5, 2.0];
    const duration = 5; // seconds per test
    let allReports = '═'.repeat(60) + '\n';
    allReports += '  COMPREHENSIVE SYNC TEST SUITE\n';
    allReports += '═'.repeat(60) + '\n\n';

    for (const rate of rates) {
      setPlaybackRate(rate);
      setStatus(`🧪 Testing at ${rate}x speed...`);

      await new Promise((resolve) => {
        const videoElement = window.__syncDiagnosticsVideoElement || document.querySelector('video');
        const audioContext = window.__syncDiagnosticsAudioContext;

        if (!videoElement) {
          setStatus('❌ Error: No video element found');
          resolve();
          return;
        }

        const diag = new SyncDiagnostics(videoElement, audioContext);
        videoElement.playbackRate = rate;

        if (videoElement.paused) {
          videoElement.play();
        }

        diag.start();

        setTimeout(() => {
          diag.stop();
          allReports += `\n${'─'.repeat(60)}\n`;
          allReports += `TEST AT ${rate}x SPEED\n`;
          allReports += '─'.repeat(60) + '\n';
          allReports += diag.generateReport();
          allReports += '\n';
          resolve();
        }, duration * 1000);
      });
    }

    setReport(allReports);
    setStatus('✅ Comprehensive test suite complete');
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          padding: '12px 16px',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
      >
        🔬 Sync Diagnostics
      </button>

      {/* Diagnostic panel */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000,
          backgroundColor: '#1e1e1e',
          color: '#e0e0e0',
          border: '2px solid #3b82f6',
          borderRadius: '12px',
          padding: '24px',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>
              🔬 Audio/Video Sync Diagnostics
            </h2>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '0',
                width: '32px',
                height: '32px'
              }}
            >
              ×
            </button>
          </div>

          {/* Controls */}
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#2a2a2a', borderRadius: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#9ca3af' }}>
                  Test Duration (seconds)
                </label>
                <input
                  type="number"
                  value={testDuration}
                  onChange={(e) => setTestDuration(Number(e.target.value))}
                  min="5"
                  max="60"
                  disabled={isRunning}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#3a3a3a',
                    border: '1px solid #4a4a4a',
                    borderRadius: '6px',
                    color: '#e0e0e0',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#9ca3af' }}>
                  Playback Rate
                </label>
                <select
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  disabled={isRunning}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#3a3a3a',
                    border: '1px solid #4a4a4a',
                    borderRadius: '6px',
                    color: '#e0e0e0',
                    fontSize: '14px'
                  }}
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                  <option value={3.0}>3.0x</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={isRunning ? stopTest : startTest}
                disabled={!window.__syncDiagnosticsVideoElement && !document.querySelector('video')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: isRunning ? '#dc2626' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
              >
                {isRunning ? '⏹ Stop Test' : '▶️ Start Test'}
              </button>
              <button
                onClick={runQuickTests}
                disabled={isRunning}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                🚀 Run Full Suite
              </button>
              {diagnosticsRef.current && (
                <button
                  onClick={exportData}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  💾 Export CSV
                </button>
              )}
            </div>
          </div>

          {/* Status */}
          {status && (
            <div style={{
              padding: '12px',
              backgroundColor: '#2a2a2a',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '14px',
              color: '#9ca3af'
            }}>
              {status}
            </div>
          )}

          {/* Report */}
          {report && (
            <div style={{
              padding: '16px',
              backgroundColor: '#1a1a1a',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              overflow: 'auto',
              maxHeight: '400px',
              border: '1px solid #3a3a3a'
            }}>
              {report}
            </div>
          )}

          {/* Instructions */}
          {!report && !isRunning && (
            <div style={{
              padding: '16px',
              backgroundColor: '#2a2a2a',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: '1.6'
            }}>
              <h3 style={{ marginTop: 0, fontSize: '16px', color: '#3b82f6' }}>📋 Instructions</h3>
              <ol style={{ marginBottom: 0, paddingLeft: '20px' }}>
                <li>Load a video in the player</li>
                <li>Set desired playback rate and test duration</li>
                <li>Click "Start Test" to begin measurement</li>
                <li>The test will run automatically and generate a report</li>
                <li>Use "Run Full Suite" to test multiple playback rates</li>
                <li>Export data as CSV for detailed analysis</li>
              </ol>
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#3a2a0a', borderRadius: '6px', border: '1px solid #d97706' }}>
                <strong style={{ color: '#fbbf24' }}>⚠️ Note:</strong> Make sure enableDiagnostics=true is set on VideoPlayer component
              </div>
            </div>
          )}
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 9998
          }}
        />
      )}
    </>
  );
}

export default SyncDiagnosticsPanel;
