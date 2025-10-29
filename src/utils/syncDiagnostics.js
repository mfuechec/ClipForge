/**
 * Audio/Video Sync Diagnostics Suite
 *
 * This utility measures timing precision and sync drift between:
 * - HTML5 video element currentTime
 * - Web Audio API AudioContext.currentTime
 * - JavaScript performance.now() timestamps
 *
 * Usage:
 *   import { SyncDiagnostics } from './utils/syncDiagnostics';
 *   const diag = new SyncDiagnostics(videoPlayer, audioContext);
 *   diag.start();
 *   // ... after playback ...
 *   const results = diag.stop();
 *   console.log(diag.generateReport());
 */

export class SyncDiagnostics {
  constructor(videoElement, audioContext = null) {
    this.videoElement = videoElement;
    this.audioContext = audioContext;

    this.measurements = [];
    this.isRunning = false;
    this.startTime = null;
    this.intervalId = null;
    this.animFrameId = null;

    // Configuration
    this.sampleRate = 60; // Hz - how often to measure
    this.usePreciseTimer = true; // Use requestAnimationFrame for higher precision
  }

  /**
   * Start diagnostic measurement
   */
  start() {
    if (this.isRunning) {
      console.warn('[SyncDiagnostics] Already running');
      return;
    }

    console.log('[SyncDiagnostics] Starting sync measurement...');
    this.isRunning = true;
    this.startTime = performance.now();
    this.measurements = [];

    if (this.usePreciseTimer) {
      this._animationFrameLoop();
    } else {
      this.intervalId = setInterval(() => this._takeMeasurement(), 1000 / this.sampleRate);
    }
  }

  /**
   * Stop diagnostic measurement and return results
   */
  stop() {
    if (!this.isRunning) {
      console.warn('[SyncDiagnostics] Not running');
      return null;
    }

    console.log('[SyncDiagnostics] Stopping sync measurement...');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    return this.measurements;
  }

  /**
   * Request animation frame loop for precise timing
   */
  _animationFrameLoop() {
    if (!this.isRunning) return;

    this._takeMeasurement();
    this.animFrameId = requestAnimationFrame(() => this._animationFrameLoop());
  }

  /**
   * Take a single measurement snapshot
   */
  _takeMeasurement() {
    if (!this.videoElement) return;

    const measurement = {
      // JavaScript timing
      perfNow: performance.now(),
      perfElapsed: performance.now() - this.startTime,

      // Video element timing
      videoTime: this.videoElement.currentTime,
      videoPaused: this.videoElement.paused,
      videoPlaybackRate: this.videoElement.playbackRate,
      videoReadyState: this.videoElement.readyState,

      // Audio context timing (if available)
      audioContextTime: this.audioContext ? this.audioContext.currentTime : null,
      audioContextState: this.audioContext ? this.audioContext.state : null,
    };

    // Calculate derived metrics if we have previous measurements
    if (this.measurements.length > 0) {
      const prev = this.measurements[this.measurements.length - 1];
      const timeDelta = measurement.perfNow - prev.perfNow;

      measurement.videoTimeDelta = measurement.videoTime - prev.videoTime;
      measurement.perfTimeDelta = timeDelta;

      if (this.audioContext && prev.audioContextTime !== null) {
        measurement.audioTimeDelta = measurement.audioContextTime - prev.audioContextTime;

        // Drift calculation: how much video and audio diverge per second
        // Positive = video ahead, Negative = audio ahead
        measurement.drift = (measurement.videoTimeDelta - measurement.audioTimeDelta) * 1000 / timeDelta;
      }

      // Expected video progress based on playback rate
      measurement.expectedVideoProgress = timeDelta / 1000 * measurement.videoPlaybackRate;
      measurement.actualVideoProgress = measurement.videoTimeDelta;
      measurement.progressError = measurement.actualVideoProgress - measurement.expectedVideoProgress;
    }

    this.measurements.push(measurement);
  }

  /**
   * Generate human-readable diagnostic report
   */
  generateReport() {
    if (this.measurements.length === 0) {
      return 'No measurements collected.';
    }

    const measurements = this.measurements.filter(m => m.drift !== undefined);

    if (measurements.length === 0) {
      return 'Insufficient measurements for drift analysis.';
    }

    // Calculate statistics
    const drifts = measurements.map(m => m.drift);
    const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length;
    const maxDrift = Math.max(...drifts);
    const minDrift = Math.min(...drifts);
    const stdDev = Math.sqrt(
      drifts.reduce((sq, n) => sq + Math.pow(n - avgDrift, 2), 0) / drifts.length
    );

    // Get playback rate (should be consistent)
    const playbackRate = this.measurements[this.measurements.length - 1].videoPlaybackRate;

    // Analyze progress errors
    const progressErrors = measurements
      .map(m => m.progressError)
      .filter(e => e !== undefined);
    const avgProgressError = progressErrors.length > 0
      ? progressErrors.reduce((a, b) => a + b, 0) / progressErrors.length
      : 0;

    const report = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AUDIO/VIDEO SYNC DIAGNOSTICS REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 MEASUREMENT SUMMARY
  Total Samples: ${this.measurements.length}
  Duration: ${(this.measurements[this.measurements.length - 1].perfElapsed / 1000).toFixed(2)}s
  Playback Rate: ${playbackRate}x
  Sample Rate: ~${(this.measurements.length / (this.measurements[this.measurements.length - 1].perfElapsed / 1000)).toFixed(1)} Hz

⏱️  TIMING ANALYSIS
  Video Time Range: ${this.measurements[0].videoTime.toFixed(3)}s → ${this.measurements[this.measurements.length - 1].videoTime.toFixed(3)}s
  ${this.audioContext ? `Audio Context Time: ${this.measurements[0].audioContextTime.toFixed(3)}s → ${this.measurements[this.measurements.length - 1].audioContextTime.toFixed(3)}s` : 'Audio Context: Not available'}

🎯 SYNC DRIFT ANALYSIS (ms of drift per second)
  ${this.audioContext ? `
  Average Drift: ${avgDrift.toFixed(3)} ms/s ${this._getDriftVerdict(avgDrift)}
  Drift Range: ${minDrift.toFixed(3)} to ${maxDrift.toFixed(3)} ms/s
  Std Deviation: ${stdDev.toFixed(3)} ms/s

  ${avgDrift > 1 ? '⚠️  SIGNIFICANT DRIFT DETECTED' : '✅ Drift within acceptable range'}
  ${Math.abs(avgDrift) > 50 ? '\n  ❌ CRITICAL: Audio and video severely out of sync!' : ''}
  ` : '⚠️  Cannot measure drift - AudioContext not available'}

📈 PLAYBACK ACCURACY
  Average Progress Error: ${(avgProgressError * 1000).toFixed(3)} ms
  ${Math.abs(avgProgressError) > 0.1 ? '⚠️  Video playback timing inconsistent' : '✅ Video playback timing accurate'}

🔍 DETAILED INTERPRETATION
${this._generateInterpretation(avgDrift, stdDev, avgProgressError, playbackRate)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 Export data: syncDiagnostics.exportMeasurements()
📊 View graph: syncDiagnostics.visualizeDrift()
`;

    return report;
  }

  _getDriftVerdict(drift) {
    if (!this.audioContext) return '(N/A - no audio context)';
    if (Math.abs(drift) < 1) return '(Excellent)';
    if (Math.abs(drift) < 10) return '(Good)';
    if (Math.abs(drift) < 50) return '(Noticeable)';
    return '(CRITICAL)';
  }

  _generateInterpretation(avgDrift, stdDev, avgProgressError, playbackRate) {
    const interpretations = [];

    if (!this.audioContext) {
      interpretations.push('  • Web Audio API is NOT active - using native HTML5 audio');
      interpretations.push('  • Native audio should sync automatically with playbackRate');
      interpretations.push('  • If you experience sync issues, the problem is likely in recording');
    } else {
      interpretations.push('  • Web Audio API is ACTIVE - audio routed through AudioContext');

      if (playbackRate !== 1.0) {
        interpretations.push(`  • Playback rate is ${playbackRate}x (not 1x)`);
        interpretations.push('  • Web Audio API does NOT respect video playbackRate!');
        interpretations.push('  • Expected behavior: Audio plays at 1x while video plays at ' + playbackRate + 'x');
        interpretations.push('  • SOLUTION: Switch to native HTML5 audio (remove Web Audio API routing)');
      } else {
        if (Math.abs(avgDrift) > 10) {
          interpretations.push('  • Drift detected even at 1x speed');
          interpretations.push('  • Possible causes: Recording sync issue, buffer underruns, or timing precision');
        } else {
          interpretations.push('  • Sync is good at 1x speed');
          interpretations.push('  • Test at 1.5x or 2x to confirm playback rate issue');
        }
      }

      if (stdDev > 10) {
        interpretations.push('  • High drift variation suggests inconsistent timing');
        interpretations.push('  • Possible cause: timeupdate events fire irregularly (~4Hz)');
      }
    }

    if (Math.abs(avgProgressError) > 0.1) {
      interpretations.push('  • Video playback timing is inconsistent');
      interpretations.push('  • Possible causes: Frame drops, CPU load, or browser throttling');
    }

    return interpretations.join('\n');
  }

  /**
   * Export measurements as CSV for external analysis
   */
  exportMeasurements() {
    if (this.measurements.length === 0) {
      console.warn('[SyncDiagnostics] No measurements to export');
      return;
    }

    const headers = Object.keys(this.measurements[0]);
    const csv = [
      headers.join(','),
      ...this.measurements.map(m =>
        headers.map(h => m[h] !== null && m[h] !== undefined ? m[h] : '').join(',')
      )
    ].join('\n');

    // Create download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-diagnostics-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('[SyncDiagnostics] Exported', this.measurements.length, 'measurements');
  }

  /**
   * Visualize drift over time in browser console
   */
  visualizeDrift() {
    if (!this.audioContext) {
      console.log('Cannot visualize drift - AudioContext not available');
      return;
    }

    const measurements = this.measurements.filter(m => m.drift !== undefined);

    if (measurements.length === 0) {
      console.log('No drift measurements available');
      return;
    }

    console.log('\n📊 DRIFT VISUALIZATION (ms/s)');
    console.log('━'.repeat(60));

    const maxAbsDrift = Math.max(...measurements.map(m => Math.abs(m.drift)));
    const scale = 40 / maxAbsDrift; // Scale to 40 chars width

    for (let i = 0; i < measurements.length; i += Math.ceil(measurements.length / 30)) {
      const m = measurements[i];
      const time = m.perfElapsed / 1000;
      const drift = m.drift;
      const barLength = Math.round(Math.abs(drift) * scale);
      const bar = drift >= 0 ? '▓'.repeat(barLength) : '░'.repeat(barLength);
      const prefix = drift >= 0 ? '     ' : bar;
      const suffix = drift >= 0 ? bar : '     ';

      console.log(`${time.toFixed(1)}s │${prefix}│${suffix} ${drift.toFixed(2)} ms/s`);
    }

    console.log('━'.repeat(60));
    console.log('      │     │ Audio ahead  │  Video ahead');
  }
}

/**
 * Quick test function - run from browser console
 */
export function runSyncTest(durationSeconds = 10, playbackRate = 1.0) {
  console.log(`🧪 Starting ${durationSeconds}s sync test at ${playbackRate}x speed...`);

  // Find video element
  const videoElement = document.querySelector('video');
  if (!videoElement) {
    console.error('❌ No video element found on page');
    return;
  }

  // Try to find AudioContext (if Web Audio API is being used)
  let audioContext = null;
  // This is a hack - in real implementation, pass the audioContext reference
  if (window.__syncDiagnosticsAudioContext) {
    audioContext = window.__syncDiagnosticsAudioContext;
  }

  const diag = new SyncDiagnostics(videoElement, audioContext);

  // Set playback rate
  videoElement.playbackRate = playbackRate;

  // Start playback
  videoElement.play();

  // Start diagnostics
  diag.start();

  // Stop after duration
  setTimeout(() => {
    diag.stop();
    videoElement.pause();
    console.log(diag.generateReport());
    diag.visualizeDrift();

    // Make available for export
    window.__lastSyncDiagnostics = diag;
    console.log('\n💡 To export data: window.__lastSyncDiagnostics.exportMeasurements()');
  }, durationSeconds * 1000);

  return diag;
}

// Make available in window for console access
if (typeof window !== 'undefined') {
  window.SyncDiagnostics = SyncDiagnostics;
  window.runSyncTest = runSyncTest;
}
