import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import './App.css';
import VideoPlayer from './components/VideoPlayer';
import Timeline from './components/Timeline';
import TrimControls from './components/TrimControls';
import RecordingControls from './components/RecordingControls';

function App() {
  const [clips, setClips] = useState([]); // Library of imported clips
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Multi-clip timeline state
  const [timelineClips, setTimelineClips] = useState([]); // Array of { clipIndex, startTime }
  const [playheadTime, setPlayheadTime] = useState(0); // Position on full timeline
  const [totalDuration, setTotalDuration] = useState(0); // Calculated from timelineClips

  // Debug hook - access clips in console via window.__clips
  useEffect(() => {
    window.__clips = clips;
  }, [clips]);

  // Calculate total timeline duration whenever timelineClips change
  useEffect(() => {
    if (timelineClips.length === 0) {
      setTotalDuration(0);
      return;
    }

    let total = 0;
    timelineClips.forEach(tc => {
      const clip = clips[tc.clipIndex];
      if (clip && clip.duration) {
        const clipDuration = clip.trimEnd && clip.trimStart
          ? clip.trimEnd - clip.trimStart
          : clip.duration;
        total += clipDuration;
      }
    });
    setTotalDuration(total);
  }, [timelineClips, clips]);

  const handleImportVideo = async () => {
    try {
      // Open file dialog
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Video',
          extensions: ['mp4', 'mov', 'webm', 'avi']
        }]
      });

      if (selected) {
        // Call Rust command to import video
        const metadata = await invoke('import_video', { path: selected });
        setClips([...clips, metadata]);
        setSelectedClipIndex(clips.length); // Select the newly added clip
      }
    } catch (error) {
      console.error('Failed to import video:', error);
      alert(`Error importing video: ${error}`);
    }
  };

  // Handle recording complete - auto-import from file path
  const handleRecordingComplete = async (filePath) => {
    try {
      console.log('[App] Recording complete, importing file:', filePath);

      // Auto-import the saved file
      const metadata = await invoke('import_video', { path: filePath });
      setClips([...clips, metadata]);
      setSelectedClipIndex(clips.length);

      console.log('[App] Recording imported successfully');
      alert('Recording complete! Your video has been added to the library. You can now edit it and export when ready.');
    } catch (error) {
      console.error('[App] Failed to import recording:', error);
      alert(`Failed to import recording: ${error}`);
    }
  };

  const handleClipSelect = (index) => {
    setSelectedClipIndex(index);
    setCurrentTime(0);
  };

  const handleAddToTimeline = useCallback((clipIndex) => {
    const clip = clips[clipIndex];
    if (!clip || !clip.duration) {
      alert('Please wait for the clip to load before adding to timeline');
      return;
    }

    // Calculate start time (end of last clip on timeline)
    let startTime = 0;
    if (timelineClips.length > 0) {
      const lastTimelineClip = timelineClips[timelineClips.length - 1];
      const lastClip = clips[lastTimelineClip.clipIndex];
      const lastClipDuration = lastClip.trimEnd && lastClip.trimStart
        ? lastClip.trimEnd - lastClip.trimStart
        : lastClip.duration;
      startTime = lastTimelineClip.startTime + lastClipDuration;
    }

    setTimelineClips([...timelineClips, { clipIndex, startTime }]);
  }, [clips, timelineClips]);

  // Calculate which clip should be playing based on playheadTime
  const getCurrentTimelineClip = useCallback(() => {
    if (timelineClips.length === 0) return null;

    for (let i = 0; i < timelineClips.length; i++) {
      const tc = timelineClips[i];
      const clip = clips[tc.clipIndex];
      if (!clip || !clip.duration) continue;

      const clipDuration = clip.trimEnd && clip.trimStart
        ? clip.trimEnd - clip.trimStart
        : clip.duration;
      const clipEndTime = tc.startTime + clipDuration;

      if (playheadTime >= tc.startTime && playheadTime < clipEndTime) {
        // Calculate local time within the clip
        const localTime = playheadTime - tc.startTime;
        const actualTime = clip.trimStart ? clip.trimStart + localTime : localTime;

        return {
          timelineClipIndex: i,
          clipIndex: tc.clipIndex,
          clip,
          localTime: actualTime,
          clipStartTime: tc.startTime,
          clipEndTime
        };
      }
    }

    return null;
  }, [timelineClips, clips, playheadTime]);

  const handleVideoLoaded = useCallback((metadata) => {
    if (selectedClipIndex !== null) {
      setClips(prevClips => {
        const updatedClips = [...prevClips];
        updatedClips[selectedClipIndex] = {
          ...updatedClips[selectedClipIndex],
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height
        };
        return updatedClips;
      });
    }
  }, [selectedClipIndex]);

  // Handle time update from video player - update playhead position on timeline
  const handleTimelineTimeUpdate = useCallback((videoTime) => {
    const currentClipInfo = getCurrentTimelineClip();
    if (!currentClipInfo) return;

    // Calculate timeline position based on video time
    const clip = currentClipInfo.clip;
    const trimOffset = clip.trimStart || 0;
    const timelinePosition = currentClipInfo.clipStartTime + (videoTime - trimOffset);

    setPlayheadTime(timelinePosition);

    // Check if we need to advance to next clip
    if (timelinePosition >= currentClipInfo.clipEndTime - 0.1) {
      const nextClipIndex = currentClipInfo.timelineClipIndex + 1;
      if (nextClipIndex < timelineClips.length) {
        // Move to next clip
        const nextTimelineClip = timelineClips[nextClipIndex];
        setPlayheadTime(nextTimelineClip.startTime);
        setSelectedClipIndex(nextTimelineClip.clipIndex);
      } else {
        // End of timeline
        setPlayheadTime(totalDuration);
      }
    }
  }, [getCurrentTimelineClip, timelineClips, totalDuration]);

  const handleSetTrimStart = useCallback(() => {
    if (selectedClipIndex !== null) {
      setClips(prevClips => {
        const updatedClips = [...prevClips];
        updatedClips[selectedClipIndex] = {
          ...updatedClips[selectedClipIndex],
          trimStart: currentTime
        };
        return updatedClips;
      });
    }
  }, [selectedClipIndex, currentTime]);

  const handleSetTrimEnd = useCallback(() => {
    if (selectedClipIndex !== null) {
      setClips(prevClips => {
        const updatedClips = [...prevClips];
        updatedClips[selectedClipIndex] = {
          ...updatedClips[selectedClipIndex],
          trimEnd: currentTime
        };
        return updatedClips;
      });
    }
  }, [selectedClipIndex, currentTime]);

  const handleClearTrim = useCallback(() => {
    if (selectedClipIndex !== null) {
      setClips(prevClips => {
        const updatedClips = [...prevClips];
        updatedClips[selectedClipIndex] = {
          ...updatedClips[selectedClipIndex],
          trimStart: null,
          trimEnd: null
        };
        return updatedClips;
      });
    }
  }, [selectedClipIndex]);

  const handleExportVideo = async () => {
    try {
      setIsExporting(true);

      // Determine default filename
      let defaultFilename = 'exported_video.mp4';
      if (timelineClips.length > 0) {
        defaultFilename = 'timeline_export.mp4';
      } else if (selectedClipIndex !== null) {
        const clip = clips[selectedClipIndex];
        defaultFilename = clip.filename.replace(/\.[^/.]+$/, '_exported.mp4');
      }

      // Open save dialog
      const outputPath = await save({
        defaultPath: defaultFilename,
        filters: [{
          name: 'Video',
          extensions: ['mp4']
        }]
      });

      if (!outputPath) {
        setIsExporting(false);
        return; // User cancelled
      }

      // If timeline has clips, export the full timeline
      if (timelineClips.length > 0) {
        console.log('[App] Exporting timeline with', timelineClips.length, 'clips');

        // Build clip segments array
        const clipSegments = timelineClips.map(tc => {
          const clip = clips[tc.clipIndex];
          return {
            input_path: clip.path,
            trim_start: clip.trimStart ?? null,
            trim_end: clip.trimEnd ?? null
          };
        });

        const result = await invoke('export_multi_clip', {
          options: {
            clips: clipSegments,
            output_path: outputPath
          }
        });

        console.log('[App] Timeline export successful:', result);
        alert(`Timeline exported successfully to:\n${result}`);
      } else if (selectedClipIndex !== null) {
        // Export single selected clip
        const clip = clips[selectedClipIndex];
        console.log('[App] Exporting single clip:', {
          input: clip.path,
          output: outputPath,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd
        });

        const result = await invoke('export_video', {
          options: {
            input_path: clip.path,
            output_path: outputPath,
            trim_start: clip.trimStart ?? null,
            trim_end: clip.trimEnd ?? null
          }
        });

        console.log('[App] Export successful:', result);
        alert(`Video exported successfully to:\n${result}`);
      } else {
        alert('Please select a clip or add clips to timeline to export');
        setIsExporting(false);
        return;
      }
    } catch (error) {
      console.error('[App] Export failed:', error);
      alert(`Export failed: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const selectedClip = selectedClipIndex !== null ? clips[selectedClipIndex] : null;

  // Get the clip that should be playing based on timeline position
  const currentTimelineClipInfo = getCurrentTimelineClip();
  const playingClip = currentTimelineClipInfo ? currentTimelineClipInfo.clip : selectedClip;
  const playingClipTime = currentTimelineClipInfo ? currentTimelineClipInfo.localTime : currentTime;

  return (
    <div className="App">
      {/* Compact Header with Title and Buttons */}
      <header className="app-header">
        <h1>🎬 ClipForge</h1>
        <div className="header-controls">
          <RecordingControls onRecordingComplete={handleRecordingComplete} />
          <button className="btn-primary" onClick={handleImportVideo}>
            Import Video
          </button>
          <button
            className="btn-secondary"
            onClick={handleExportVideo}
            disabled={clips.length === 0 || isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export Video'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Video Section - Takes up most space */}
        <div className="video-section">
          <VideoPlayer
            videoPath={playingClip?.path || selectedClip?.path}
            onTimeUpdate={timelineClips.length > 0 ? handleTimelineTimeUpdate : setCurrentTime}
            currentTime={timelineClips.length > 0 ? playingClipTime : currentTime}
            onVideoLoaded={handleVideoLoaded}
            trimStart={playingClip?.trimStart ?? null}
            trimEnd={playingClip?.trimEnd ?? null}
          />
        </div>

        {/* Timeline Section - Fixed bottom area */}
        <div className="timeline-section">
          {selectedClip && (
            <TrimControls
              currentTime={currentTime}
              duration={selectedClip.duration}
              trimStart={selectedClip.trimStart ?? null}
              trimEnd={selectedClip.trimEnd ?? null}
              onSetTrimStart={handleSetTrimStart}
              onSetTrimEnd={handleSetTrimEnd}
              onClearTrim={handleClearTrim}
            />
          )}
          <Timeline
            clips={clips}
            timelineClips={timelineClips}
            onClipSelect={handleClipSelect}
            onAddToTimeline={handleAddToTimeline}
            selectedClipIndex={selectedClipIndex}
            playheadTime={playheadTime}
            totalDuration={totalDuration}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
