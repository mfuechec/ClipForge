import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import './App.css';
import VideoPlayer from './components/VideoPlayer';
import Timeline from './components/Timeline';
import RecordingControls from './components/RecordingControls';
import { TimelineProvider, useTimeline } from './TimelineContext';

function AppContent({ clips, setClips }) {
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [selectedTimelineClipId, setSelectedTimelineClipId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isTrimMode, setIsTrimMode] = useState(false);
  const [trimStartTime, setTrimStartTime] = useState(null); // Track where trim selection started

  // Get timeline state and functions from context
  const {
    timelineClips,
    playheadTime,
    totalDuration,
    addClipToTimeline,
    removeClipFromTimeline,
    updateTimelineClipTrim,
    splitTimelineClip,
    seekPlayhead,
    getActiveClipAtTime,
    clearTimeline,
    handleClipDeleted
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
    setSelectedTimelineClipId(null); // Clear timeline selection
    setCurrentTime(0);
  };


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
    const timelineClip = currentClipInfo.timelineClip;
    const trimOffset = timelineClip.trimStart || 0;
    const clipStartTime = timelineClip.startTime;
    const timelinePosition = clipStartTime + (videoTime - trimOffset);

    // Only update if the position has actually changed (avoid feedback loops)
    if (Math.abs(timelinePosition - playheadTime) > 0.05) {
      seekPlayhead(timelinePosition);
    }

    // Check if we need to advance to next clip
    const clipDuration = (timelineClip.trimEnd != null && timelineClip.trimStart != null)
      ? timelineClip.trimEnd - timelineClip.trimStart
      : clip.duration;
    const clipEndTime = clipStartTime + clipDuration;

    if (timelinePosition >= clipEndTime - 0.1) {
      // Find next clip in timeline
      const currentIndex = timelineClips.findIndex(tc => tc.id === timelineClip.id);
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


  const handleDeleteClip = useCallback((clipIndex) => {
    const clip = clips[clipIndex];

    if (!clip) {
      console.error('[App] Attempted to delete non-existent clip at index:', clipIndex);
      return;
    }

    // Check if clip is used in timeline
    const usedInTimeline = timelineClips.some(tc => tc.clipIndex === clipIndex);

    const message = usedInTimeline
      ? `Delete "${clip.filename}"?\n\nThis will remove it from the timeline and media library.`
      : `Delete "${clip.filename}"?\n\nThis cannot be undone.`;

    if (window.confirm(message)) {
      console.log('[App] Deleting clip at index:', clipIndex, clip.filename);

      // Clear selection if deleting the selected clip
      if (selectedClipIndex === clipIndex) {
        setSelectedClipIndex(null);
      } else if (selectedClipIndex !== null && selectedClipIndex > clipIndex) {
        // Adjust selection index if it's after the deleted clip
        setSelectedClipIndex(selectedClipIndex - 1);
      }

      // Notify timeline context to clean up before deletion
      handleClipDeleted(clipIndex);

      // Remove from clips array
      setClips(prevClips => prevClips.filter((_, idx) => idx !== clipIndex));
    }
  }, [clips, timelineClips, selectedClipIndex, handleClipDeleted]);

  // Keyboard event handler for Delete/Backspace and 't' for trim
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Handle 't' key for trim mode
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();

        // If no clips on timeline, ignore
        if (timelineClips.length === 0) {
          return;
        }

        // If trim not started, start trim selection at current playhead
        if (trimStartTime === null) {
          console.log('[App] Starting trim selection at playhead:', playheadTime);
          setTrimStartTime(playheadTime);
          setIsTrimMode(true);
          return;
        }

        // If trim already started, complete the trim
        console.log('[App] Completing trim from', trimStartTime, 'to', playheadTime);

        const startTime = Math.min(trimStartTime, playheadTime);
        const endTime = Math.max(trimStartTime, playheadTime);

        // Ignore if selection is too small
        if (Math.abs(endTime - startTime) < 0.1) {
          console.log('[App] Trim selection too small, ignoring');
          setTrimStartTime(null);
          setIsTrimMode(false);
          return;
        }

        // Find which timeline clip(s) contain the selected region
        const affectedClips = [];

        for (const timelineClip of timelineClips) {
          const clip = clips[timelineClip.clipIndex];
          if (!clip) continue;

          // Use timeline clip's trim points
          const clipDuration = (timelineClip.trimEnd != null && timelineClip.trimStart != null)
            ? timelineClip.trimEnd - timelineClip.trimStart
            : clip.duration;

          const clipEndTime = timelineClip.startTime + clipDuration;

          // Check if this clip overlaps with the selection
          if (timelineClip.startTime < endTime && clipEndTime > startTime) {
            affectedClips.push({ timelineClip, clip, clipEndTime, clipDuration });
          }
        }

        if (affectedClips.length === 0) {
          console.log('[App] No clips found in trim selection');
          setTrimStartTime(null);
          setIsTrimMode(false);
          return;
        }

        // For now, only handle trimming a single clip (the first affected one)
        const { timelineClip, clip, clipEndTime, clipDuration } = affectedClips[0];

        // Calculate where the selection intersects with this clip on the timeline
        const clipStartTime = timelineClip.startTime;
        const selectionStartInClip = Math.max(0, startTime - clipStartTime);
        const selectionEndInClip = Math.min(clipDuration, endTime - clipStartTime);

        // Determine trim type based on selection position
        const startThreshold = clipDuration * 0.1; // First 10%
        const endThreshold = clipDuration * 0.9;   // Last 10%

        if (selectionStartInClip < startThreshold) {
          // Trim from the start
          const currentTrimStart = timelineClip.trimStart ?? 0;
          const newTrimStart = currentTrimStart + selectionEndInClip;
          const currentTrimEnd = timelineClip.trimEnd ?? clip.duration;

          console.log('[App] Trimming from start:', { timelineClipId: timelineClip.id, newTrimStart, trimEnd: currentTrimEnd });
          updateTimelineClipTrim(timelineClip.id, newTrimStart, currentTrimEnd);
        } else if (selectionEndInClip > endThreshold) {
          // Trim from the end
          const currentTrimStart = timelineClip.trimStart ?? 0;
          const currentTrimEnd = timelineClip.trimEnd ?? clip.duration;
          const newTrimEnd = currentTrimStart + selectionStartInClip;

          console.log('[App] Trimming from end:', { timelineClipId: timelineClip.id, trimStart: currentTrimStart, newTrimEnd });
          updateTimelineClipTrim(timelineClip.id, currentTrimStart, newTrimEnd);
        } else {
          // Trim from the middle - split the clip
          console.log('[App] Trimming from middle - splitting clip:', {
            timelineClipId: timelineClip.id,
            removeStart: selectionStartInClip,
            removeEnd: selectionEndInClip
          });
          splitTimelineClip(timelineClip.id, selectionStartInClip, selectionEndInClip);
        }

        // Reset trim state
        setTrimStartTime(null);
        setIsTrimMode(false);
        return;
      }

      // Check if Delete or Backspace was pressed
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Prevent default backspace navigation
        if (e.key === 'Backspace') {
          e.preventDefault();
        }

        // Priority 1: If a timeline clip is selected, remove it from timeline
        if (selectedTimelineClipId) {
          console.log('[App] Removing timeline clip via keyboard:', selectedTimelineClipId);
          removeClipFromTimeline(selectedTimelineClipId);
          setSelectedTimelineClipId(null);
          return;
        }

        // Priority 2: If a media library clip is selected, delete it
        if (selectedClipIndex !== null) {
          console.log('[App] Deleting media library clip via keyboard:', selectedClipIndex);
          handleDeleteClip(selectedClipIndex);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTimelineClipId, selectedClipIndex, removeClipFromTimeline, handleDeleteClip, trimStartTime, playheadTime, timelineClips, clips, updateTimelineClipTrim, splitTimelineClip]);

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

        // Build clip segments array - use timeline clip's trim points
        const clipSegments = timelineClips.map(tc => {
          const clip = clips[tc.clipIndex];
          return {
            input_path: clip.path,
            trim_start: tc.trimStart ?? null,
            trim_end: tc.trimEnd ?? null
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
  // Get trim points from the timeline clip instance (not the source clip)
  const playingTrimStart = currentTimelineClipInfo ? currentTimelineClipInfo.timelineClip.trimStart : null;
  const playingTrimEnd = currentTimelineClipInfo ? currentTimelineClipInfo.timelineClip.trimEnd : null;

  console.log('[App] VideoPlayer will receive:');
  console.log('[App]   videoPath:', playingClip?.path);
  console.log('[App]   currentTime:', playingClipTime);
  console.log('[App]   trimStart:', playingTrimStart, 'trimEnd:', playingTrimEnd);

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
            trimStart={playingTrimStart}
            trimEnd={playingTrimEnd}
          />
        </div>

        {/* Timeline Section - Fixed bottom area */}
        <div className="timeline-section">
          <div className="timeline-controls">
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
              className={`btn-secondary ${isTrimMode ? 'active' : ''}`}
              disabled={timelineClips.length === 0}
              title="Press 't' to start/complete trim at playhead position"
            >
              {trimStartTime !== null ? '✂️ Trimming... (press T)' : '✂️ Trim Mode (press T)'}
            </button>
          </div>
          <Timeline
            clips={clips}
            onClipSelect={handleClipSelect}
            selectedClipIndex={selectedClipIndex}
            selectedTimelineClipId={selectedTimelineClipId}
            onTimelineClipSelect={setSelectedTimelineClipId}
            isTrimMode={isTrimMode}
            trimStartTime={trimStartTime}
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
