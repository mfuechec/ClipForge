import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import './App.css';
import VideoPlayer from './components/VideoPlayer';
import Timeline from './components/Timeline';
import TrimControls from './components/TrimControls';
import RecordingControls from './components/RecordingControls';
import { TimelineProvider, useTimeline } from './TimelineContext';

function AppContent({ clips, setClips }) {
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Track last added clip to prevent rapid duplicates
  const lastAddedRef = useRef({ clipIndex: null, timestamp: 0 });

  // Get timeline state and functions from context
  const {
    timelineClips,
    playheadTime,
    totalDuration,
    addClipToTimeline,
    seekPlayhead,
    getActiveClipAtTime,
    clearTimeline
  } = useTimeline();

  // Debug hook - access clips in console via window.__clips
  useEffect(() => {
    window.__clips = clips;
  }, [clips]);

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
        console.log('[App] Importing video from path:', selected);
        const metadata = await invoke('import_video', { path: selected });
        console.log('[App] Received metadata:', metadata);
        setClips([...clips, metadata]);
        // Don't auto-select - let user drag to timeline
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
      console.log('[App] Importing recording from path:', filePath);
      const metadata = await invoke('import_video', { path: filePath });
      console.log('[App] Recording metadata:', metadata);
      setClips([...clips, metadata]);
      // Don't auto-select - let user drag to timeline

      console.log('[App] Recording imported successfully');
      alert('Recording complete! Your video has been added to the media library. Drag it to the timeline to use it.');
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
    const now = Date.now();
    const timeSinceLastAdd = now - lastAddedRef.current.timestamp;

    console.log('[App] handleAddToTimeline called with clipIndex:', clipIndex);

    // Prevent duplicate additions within 500ms
    if (lastAddedRef.current.clipIndex === clipIndex && timeSinceLastAdd < 500) {
      console.warn('[App] Duplicate add prevented - same clip within 500ms');
      return;
    }

    const clip = clips[clipIndex];
    console.log('[App] Clip data:', clip);
    console.log('[App] Clip has duration?', !!clip?.duration, 'Duration value:', clip?.duration);

    if (!clip || !clip.duration) {
      console.error('[App] Clip missing or no duration. Clip:', clip);
      alert('Please wait for the clip to load before adding to timeline');
      return;
    }

    console.log('[App] Adding clip to timeline:', clip.filename);

    // Update last added tracker
    lastAddedRef.current = { clipIndex, timestamp: now };

    // Add to timeline (context will calculate position)
    // Pass the clips array so context has fresh data
    addClipToTimeline(clipIndex, null, clips);
  }, [clips, addClipToTimeline]);

  const handleVideoLoaded = useCallback((metadata) => {
    // When a video loads, update the clip metadata ONLY if it's missing
    // Use the playing clip from timeline if available
    const clipInfo = timelineClips.length > 0 ? getActiveClipAtTime(playheadTime) : null;
    const clipIndexToUpdate = clipInfo ? clipInfo.timelineClip.clipIndex : selectedClipIndex;

    if (clipIndexToUpdate !== null && clipIndexToUpdate !== undefined) {
      setClips(prevClips => {
        const existingClip = prevClips[clipIndexToUpdate];

        // Only update if metadata is actually missing (prevents infinite loop)
        if (existingClip && !existingClip.duration) {
          const updatedClips = [...prevClips];
          updatedClips[clipIndexToUpdate] = {
            ...existingClip,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height
          };
          console.log('[App] Updated clip metadata from video player for clip', clipIndexToUpdate);
          return updatedClips;
        }

        // No change needed
        return prevClips;
      });
    }
  }, [selectedClipIndex, timelineClips, getActiveClipAtTime, playheadTime]);

  // Handle time update from video player - update playhead position on timeline
  const handleTimelineTimeUpdate = useCallback((videoTime) => {
    const currentClipInfo = getActiveClipAtTime(playheadTime);
    if (!currentClipInfo) return;

    // Calculate timeline position based on video time
    const clip = currentClipInfo.clip;
    const trimOffset = clip.trimStart || 0;
    const clipStartTime = currentClipInfo.timelineClip.startTime;
    const timelinePosition = clipStartTime + (videoTime - trimOffset);

    seekPlayhead(timelinePosition);

    // Check if we need to advance to next clip
    const clipDuration = (clip.trimEnd != null && clip.trimStart != null)
      ? clip.trimEnd - clip.trimStart
      : clip.duration;
    const clipEndTime = clipStartTime + clipDuration;

    if (timelinePosition >= clipEndTime - 0.1) {
      // Find next clip in timeline
      const currentIndex = timelineClips.findIndex(tc => tc.id === currentClipInfo.timelineClip.id);
      const nextClipIndex = currentIndex + 1;
      if (nextClipIndex < timelineClips.length) {
        // Move to next clip
        const nextTimelineClip = timelineClips[nextClipIndex];
        seekPlayhead(nextTimelineClip.startTime);
        setSelectedClipIndex(nextTimelineClip.clipIndex);
      } else {
        // End of timeline
        seekPlayhead(totalDuration);
      }
    }
  }, [getActiveClipAtTime, playheadTime, seekPlayhead, timelineClips, totalDuration, setSelectedClipIndex]);

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
  // ONLY play from timeline, not from library selection
  const currentTimelineClipInfo = getActiveClipAtTime(playheadTime);
  console.log('[App] getActiveClipAtTime returned:', currentTimelineClipInfo);
  console.log('[App] playheadTime:', playheadTime, 'timelineClips.length:', timelineClips.length);

  const playingClip = currentTimelineClipInfo ? currentTimelineClipInfo.clip : null;
  const playingClipTime = currentTimelineClipInfo ? currentTimelineClipInfo.offsetInClip : 0;

  console.log('[App] VideoPlayer will receive:');
  console.log('[App]   videoPath:', playingClip?.path);
  console.log('[App]   currentTime:', playingClipTime);

  // Debug video playback
  if (timelineClips.length > 0 && !playingClip) {
    console.warn('[App] Timeline has clips but no active clip found!');
    console.warn('[App] playheadTime:', playheadTime);
    console.warn('[App] timelineClips:', timelineClips);
    console.warn('[App] First clip starts at:', timelineClips[0]?.startTime);
  }

  // When playhead changes (from drag or click), update video player and selected clip
  useEffect(() => {
    if (timelineClips.length > 0 && playheadTime >= 0) {
      const clipInfo = getActiveClipAtTime(playheadTime);
      if (clipInfo) {
        // Switch to the clip that should be playing at this time
        setSelectedClipIndex(clipInfo.timelineClip.clipIndex);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadTime, timelineClips]); // getActiveClipAtTime is stable (useCallback)

  // Auto-load first clip when timeline clips are added
  useEffect(() => {
    console.log('[App] Timeline clips changed, count:', timelineClips.length);

    if (timelineClips.length === 0) {
      // Timeline cleared - reset playhead to 0
      if (playheadTime !== 0) {
        seekPlayhead(0);
      }
      return;
    }

    if (timelineClips.length > 0 && playheadTime === 0) {
      // Only auto-load if playhead is at 0 (prevents re-triggering)
      const firstClip = timelineClips[0];
      console.log('[App] Auto-loading timeline - first clip at:', firstClip.startTime);

      if (firstClip) {
        // Seek to just past the start to trigger video load
        const seekPosition = firstClip.startTime + 0.01;
        seekPlayhead(seekPosition);
      }
    }
  }, [timelineClips.length, seekPlayhead, playheadTime]); // Proper dependencies

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
            onClick={() => {
              if (confirm('Clear timeline? This will remove all clips from the timeline but keep them in the library.')) {
                clearTimeline();
              }
            }}
            disabled={timelineClips.length === 0}
          >
            Clear Timeline
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
            videoPath={playingClip?.path}
            onTimeUpdate={handleTimelineTimeUpdate}
            currentTime={playingClipTime}
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
            onClipSelect={handleClipSelect}
            onAddToTimeline={handleAddToTimeline}
            selectedClipIndex={selectedClipIndex}
          />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [clips, setClips] = useState([]);

  return (
    <TimelineProvider clips={clips}>
      <AppContent clips={clips} setClips={setClips} />
    </TimelineProvider>
  );
}

export default App;
