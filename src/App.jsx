import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import './App.css';
import VideoPlayer from './components/VideoPlayer';
import Timeline from './components/Timeline';
import RecordingControls from './components/RecordingControls';
import MediaLibrary from './components/MediaLibrary';
import TranscriptPanel from './components/TranscriptPanel';
import { TimelineProvider, useTimeline } from './TimelineContext';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

function AppContent({ clips, setClips }) {
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [selectedTimelineClipId, setSelectedTimelineClipId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isTrimMode, setIsTrimMode] = useState(false);
  const [trimStartTime, setTrimStartTime] = useState(null); // Track where trim selection started
  const [isClipMode, setIsClipMode] = useState(false);
  const [clipStartTime, setClipStartTime] = useState(null); // Track where clip selection started
  const [renamingClipId, setRenamingClipId] = useState(null); // Track which timeline clip is being renamed
  const [renamingMediaClipIndex, setRenamingMediaClipIndex] = useState(null); // Track which media clip is being renamed
  const [mediaLibraryCollapsed, setMediaLibraryCollapsed] = useState(true);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const dragStartTimeRef = useRef(0);
  const currentDragPositionRef = useRef({ x: 0, y: 0 });

  // Get timeline state and functions from context
  const {
    timelineClips,
    playheadTime,
    totalDuration,
    addClipToTimeline,
    removeClipFromTimeline,
    reorderTimelineClips,
    updateTimelineClipTrim,
    splitTimelineClip,
    renameTimelineClip,
    seekPlayhead,
    getActiveClipAtTime,
    clearTimeline,
    handleClipDeleted,
    getClipExtractionParams
  } = useTimeline();

  // Transcript data - per clip transcripts stored by video path
  const [transcriptsByPath, setTranscriptsByPath] = useState({});
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);

  // Get API key from environment variable
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

  // Get the clip that should be playing based on timeline position
  // ONLY play from timeline, not from library selection
  const currentTimelineClipInfo = getActiveClipAtTime(playheadTime);
  const playingClip = currentTimelineClipInfo ? currentTimelineClipInfo.clip : null;
  const playingClipTime = currentTimelineClipInfo ? currentTimelineClipInfo.offsetInClip : 0;
  // Get trim points from the timeline clip instance (not the source clip)
  const playingTrimStart = currentTimelineClipInfo ? currentTimelineClipInfo.timelineClip.trimStart : null;
  const playingTrimEnd = currentTimelineClipInfo ? currentTimelineClipInfo.timelineClip.trimEnd : null;

  // Get transcript for currently playing clip
  // Filter out segments that start beyond the clip duration (Whisper sometimes generates extra segments)
  const transcriptSegments = playingClip
    ? (transcriptsByPath[playingClip.path] || []).filter(seg => seg.start < (playingClip.duration || Infinity))
    : [];

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  // Debug hook - access clips in console via window.__clips
  useEffect(() => {
    window.__clips = clips;
  }, [clips]);

  // Auto-expand media library when clips are added
  useEffect(() => {
    if (clips.length > 0 && mediaLibraryCollapsed) {
      setMediaLibraryCollapsed(false);
    }
  }, [clips.length]); // Only watch clips.length to avoid closing when clips change

  // Auto-expand transcript panel when transcript is available
  useEffect(() => {
    if (transcriptSegments.length > 0 && transcriptCollapsed) {
      setTranscriptCollapsed(false);
    }
  }, [transcriptSegments.length, transcriptCollapsed]);

  // Handle transcription
  const handleTranscribeVideo = async () => {
    // Use the first clip with video if no clip is currently playing
    const clipToTranscribe = playingClip || (clips.length > 0 ? clips[0] : null);

    if (!clipToTranscribe) {
      alert('No video available. Please import a video first.');
      return;
    }

    if (!openaiKey) {
      alert('OpenAI API key not found.\n\nPlease add VITE_OPENAI_API_KEY to your .env file.\n\nGet your API key at: https://platform.openai.com/api-keys');
      return;
    }

    setIsTranscribing(true);
    try {
      console.log('[App] Starting transcription for:', clipToTranscribe.path);
      const result = await invoke('transcribe_video', {
        videoPath: clipToTranscribe.path,
        apiKey: openaiKey
      });

      console.log('[App] Transcription result:', result);

      // Convert segments to match our format, preserving both start and end
      const segments = result.segments.map(seg => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        isFiller: seg.is_filler,
        confidence: seg.confidence
      }));

      setTranscriptsByPath(prev => ({
        ...prev,
        [clipToTranscribe.path]: segments
      }));

      alert(`Transcription complete! Found ${segments.length} segments.`);
    } catch (error) {
      console.error('[App] Transcription failed:', error);
      alert(`Transcription failed: ${error}`);
    } finally {
      setIsTranscribing(false);
    }
  };

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
  }, [clips, timelineClips, selectedClipIndex, handleClipDeleted]);

  // Handle clip mode toggle/action (called by both button and keyboard)
  const handleClipModeAction = useCallback(() => {
    // If no clips on timeline, ignore
    if (timelineClips.length === 0) {
      return;
    }

    // If clip selection not started, start clip selection at current playhead
    if (clipStartTime === null) {
      console.log('[App] Starting clip selection at playhead:', playheadTime);
      setClipStartTime(playheadTime);
      setIsClipMode(true);
      return;
    }

    // If clip selection already started, complete the clip extraction
    console.log('[App] Completing clip extraction from', clipStartTime, 'to', playheadTime);

    const startTime = Math.min(clipStartTime, playheadTime);
    const endTime = Math.max(clipStartTime, playheadTime);

    // Ignore if selection is too small
    if (Math.abs(endTime - startTime) < 0.1) {
      console.log('[App] Clip selection too small, ignoring');
      setClipStartTime(null);
      setIsClipMode(false);
      return;
    }

    // Find which timeline clip(s) contain the selected region
    // For simplicity, we'll only extract from the first affected clip
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
      console.log('[App] No clips found in clip selection');
      setClipStartTime(null);
      setIsClipMode(false);
      return;
    }

    // Extract from the first affected clip
    const { timelineClip, clipDuration } = affectedClips[0];
    const timelineClipStartTime = timelineClip.startTime;
    const selectionStartInClip = Math.max(0, startTime - timelineClipStartTime);
    const selectionEndInClip = Math.min(clipDuration, endTime - timelineClipStartTime);

    console.log('[App] Extracting clip section:', {
      timelineClipId: timelineClip.id,
      extractStart: selectionStartInClip,
      extractEnd: selectionEndInClip
    });

    // Call extraction function
    handleExtractClip(timelineClip.id, selectionStartInClip, selectionEndInClip);

    // Reset clip mode state
    setClipStartTime(null);
    setIsClipMode(false);
  }, [clipStartTime, playheadTime, timelineClips, clips]);

  // Extract a clip section and add to media library
  const handleExtractClip = async (timelineClipId, extractStart, extractEnd) => {
    try {
      console.log('[App] Extracting clip from timeline clip:', timelineClipId, 'from', extractStart, 'to', extractEnd);

      // Get extraction parameters
      const params = getClipExtractionParams(timelineClipId, extractStart, extractEnd);
      if (!params) {
        console.error('[App] Failed to get extraction parameters');
        alert('Failed to extract clip: Could not find clip');
        return;
      }

      const { sourceClip, trimStart, trimEnd, duration } = params;
      console.log('[App] Extraction params:', { sourceClip: sourceClip.filename, trimStart, trimEnd, duration });

      // Generate output filename automatically
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const baseName = sourceClip.filename.replace(/\.[^/.]+$/, '');
      const extension = sourceClip.filename.match(/\.[^/.]+$/)?.[0] || '.mp4';
      const outputFilename = `${baseName}_clip_${timestamp}${extension}`;

      // Save to same directory as source clip
      const sourceDir = sourceClip.path.substring(0, sourceClip.path.lastIndexOf('/'));
      const outputPath = `${sourceDir}/${outputFilename}`;

      console.log('[App] Extracting to:', outputPath);
      setIsExporting(true);

      // Call Rust backend to extract the clip
      const result = await invoke('export_video', {
        options: {
          input_path: sourceClip.path,
          output_path: outputPath,
          trim_start: trimStart,
          trim_end: trimEnd
        }
      });

      console.log('[App] Extraction successful:', result);

      // Import the extracted clip back into the library
      const metadata = await invoke('import_video', { path: result });
      console.log('[App] Imported extracted clip:', metadata);

      setClips([...clips, metadata]);
      console.log(`[App] Clip extracted successfully! Duration: ${duration.toFixed(2)}s - Added to media library`);
    } catch (error) {
      console.error('[App] Extraction failed:', error);
      alert(`Clip extraction failed: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handler for completing timeline clip rename (submitting or canceling)
  const handleCompleteRename = (timelineClipId, newName) => {
    if (timelineClipId && newName) {
      // Submit rename
      renameTimelineClip(timelineClipId, newName);
    }
    // Exit rename mode
    setRenamingClipId(null);
  };

  // Handler for completing media library clip rename (submitting or canceling)
  const handleRenameMediaClip = (clipIndex, newName) => {
    if (clipIndex !== null && newName) {
      // Update the filename in the clips array
      const updatedClips = clips.map((clip, index) =>
        index === clipIndex
          ? { ...clip, filename: newName }
          : clip
      );
      setClips(updatedClips);
      console.log('[App] Renamed media clip', clipIndex, 'to:', newName);
    }
    // Exit rename mode
    setRenamingMediaClipIndex(null);
  };

  // Keyboard event handler for Delete/Backspace, 't' for trim, 'c' for clip, and 'r' for rename
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Handle 'c' key for clip mode
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleClipModeAction();
        return;
      }

      // Handle 'r' key for rename mode
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();

        // Priority 1: If a timeline clip is selected, rename it
        if (selectedTimelineClipId) {
          console.log('[App] Starting rename for timeline clip:', selectedTimelineClipId);
          setRenamingClipId(selectedTimelineClipId);
          return;
        }

        // Priority 2: If a media library clip is selected, rename it
        if (selectedClipIndex !== null) {
          console.log('[App] Starting rename for media clip:', selectedClipIndex);
          setRenamingMediaClipIndex(selectedClipIndex);
          return;
        }
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
        const timelineClipStartTime = timelineClip.startTime;
        const selectionStartInClip = Math.max(0, startTime - timelineClipStartTime);
        const selectionEndInClip = Math.min(clipDuration, endTime - timelineClipStartTime);

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
  }, [selectedTimelineClipId, selectedClipIndex, removeClipFromTimeline, handleDeleteClip, trimStartTime, clipStartTime, playheadTime, timelineClips, clips, updateTimelineClipTrim, splitTimelineClip, handleClipModeAction]);

  const handleMergeTimeline = async () => {
    if (timelineClips.length === 0) {
      return;
    }

    if (timelineClips.length === 1) {
      return;
    }

    try {
      setIsExporting(true);

      // Generate output filename based on clip names
      const firstTimelineClip = timelineClips[0];
      const lastTimelineClip = timelineClips[timelineClips.length - 1];

      const firstClip = clips[firstTimelineClip.clipIndex];
      const lastClip = clips[lastTimelineClip.clipIndex];

      // Get clip names (prefer customName, fallback to filename without extension)
      const getClipName = (timelineClip, clip) => {
        const name = timelineClip.customName || clip.filename;
        // Remove file extension
        return name.replace(/\.[^/.]+$/, '');
      };

      const firstName = getClipName(firstTimelineClip, firstClip);
      const lastName = getClipName(lastTimelineClip, lastClip);

      const outputFilename = `Merge: ${firstName}-${lastName}.mp4`;

      // Use the same directory as the first clip
      const sourceDir = firstClip.path.substring(0, firstClip.path.lastIndexOf('/'));
      const outputPath = `${sourceDir}/${outputFilename}`;

      console.log('[App] Merging timeline with', timelineClips.length, 'clips to:', outputPath);

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

      console.log('[App] Timeline merge successful:', result);

      // Import the merged clip back into the library
      const metadata = await invoke('import_video', { path: result });
      console.log('[App] Imported merged clip:', metadata);

      // Add to clips array
      const newClips = [...clips, metadata];
      setClips(newClips);

      // Clear the timeline and add the merged clip
      clearTimeline();

      // Wait a tick for state to update, then add the merged clip
      setTimeout(() => {
        addClipToTimeline(newClips.length - 1, null, newClips);
      }, 0);

      console.log('[App] Merged clip added to timeline');
    } catch (error) {
      console.error('[App] Merge failed:', error);
      alert(`Merge failed: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

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

  // Debug logging
  console.log('[App] getActiveClipAtTime returned:', currentTimelineClipInfo);
  console.log('[App] playheadTime:', playheadTime, 'timelineClips.length:', timelineClips.length);
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

  // Drag and drop handlers
  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
    if (event.active.data.current?.type === 'playhead') {
      dragStartTimeRef.current = playheadTime;
    }
  }, [playheadTime]);

  const handleDragMove = useCallback((event) => {
    const { active, delta } = event;
    const dragType = active.data.current?.type;

    // Track current drag position for drop calculation
    if (event.activatorEvent?.clientX !== undefined) {
      currentDragPositionRef.current = {
        x: event.activatorEvent.clientX + delta.x,
        y: event.activatorEvent.clientY + delta.y
      };
    }

    if (dragType === 'playhead') {
      const pixelsPerSecond = 20;
      const timeDelta = delta.x / pixelsPerSecond;
      const newTime = Math.max(0, Math.min(dragStartTimeRef.current + timeDelta, totalDuration));
      seekPlayhead(newTime);
    }
  }, [totalDuration, seekPlayhead]);

  const handleDragEnd = useCallback((event) => {
    setActiveId(null);
    const { active, over } = event;
    const dragType = active.data.current?.type;

    if (dragType === 'playhead') {
      return;
    }

    // Helper function to calculate insertion index based on drop position
    const calculateInsertionIndex = (clientX) => {
      const timelineTrack = document.querySelector('.timeline-track');
      if (!timelineTrack) return null;

      const rect = timelineTrack.getBoundingClientRect();
      const dropX = clientX - rect.left;
      const pixelsPerSecond = 20;
      const dropTime = Math.max(0, dropX / pixelsPerSecond);

      // Find which index to insert at based on drop time
      let insertIndex = 0;
      for (let i = 0; i < timelineClips.length; i++) {
        const tc = timelineClips[i];
        const clip = clips[tc.clipIndex];
        if (!clip) continue;

        const duration = (tc.trimEnd != null && tc.trimStart != null)
          ? tc.trimEnd - tc.trimStart
          : clip.duration;
        const midPoint = tc.startTime + duration / 2;

        if (dropTime < midPoint) {
          break;
        }
        insertIndex = i + 1;
      }

      return insertIndex;
    };

    // Handle media clip dragging to timeline
    if (dragType === 'media-clip' && over?.id === 'timeline-track') {
      const clipIndex = active.data.current.clipIndex;
      const clip = clips[clipIndex];

      if (!clip || !clip.duration) {
        alert('Please wait for the clip to load before adding to timeline');
        return;
      }

      // Get the mouse position from the tracked position
      const clientX = currentDragPositionRef.current.x;
      const insertIndex = clientX !== undefined ? calculateInsertionIndex(clientX) : null;

      console.log('[App] Dropping media clip at index:', insertIndex);
      addClipToTimeline(clipIndex, null, clips, insertIndex);
      return;
    }

    // Handle timeline clip reordering (dragging within timeline)
    if (dragType === 'timeline-clip' && over?.id === 'timeline-track') {
      const timelineClipId = active.data.current.timelineClipId;

      // Get the mouse position from the tracked position
      const clientX = currentDragPositionRef.current.x;
      let insertIndex = clientX !== undefined ? calculateInsertionIndex(clientX) : null;

      if (insertIndex !== null) {
        // Find the current index of the clip being moved
        const currentIndex = timelineClips.findIndex(tc => tc.id === timelineClipId);

        // Adjust insertion index if moving a clip to a later position
        // (because the clip will be removed first, shifting indices down)
        if (currentIndex !== -1 && insertIndex > currentIndex) {
          insertIndex = Math.max(0, insertIndex - 1);
        }

        console.log('[App] Reordering timeline clip from index', currentIndex, 'to index:', insertIndex);
        reorderTimelineClips(timelineClipId, insertIndex);
      }
      return;
    }

    // Handle timeline clip dragging back to media library (remove from timeline)
    if (dragType === 'timeline-clip' && (over?.id === 'media-library' || !over)) {
      const timelineClipId = active.data.current.timelineClipId;
      removeClipFromTimeline(timelineClipId);
      return;
    }
  }, [clips, timelineClips, addClipToTimeline, removeClipFromTimeline, reorderTimelineClips]);

  // Get active dragged item for overlay
  const getActiveItem = useCallback(() => {
    if (!activeId) return null;

    if (activeId.startsWith('media-clip-')) {
      const index = parseInt(activeId.replace('media-clip-', ''));
      return { type: 'media-clip', clip: clips[index], index };
    }

    const timelineClip = timelineClips.find(tc => tc.id === activeId);
    if (timelineClip) {
      return { type: 'timeline-clip', clip: clips[timelineClip.clipIndex], timelineClip };
    }

    return null;
  }, [activeId, clips, timelineClips]);

  const activeItem = getActiveItem();

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate grid columns and rows based on collapsed states
  const gridColumns = `${mediaLibraryCollapsed ? '0' : '200px'} 1fr ${transcriptCollapsed ? '0' : '250px'}`;
  const gridRows = `60px 1fr 280px`; // Fixed timeline height

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
    <div className="App" style={{ gridTemplateColumns: gridColumns, gridTemplateRows: gridRows }}>
      {/* Header - Spans Full Width */}
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

      {/* Media Library Panel - Left */}
      <MediaLibrary
        clips={clips}
        selectedClipIndex={selectedClipIndex}
        onClipSelect={handleClipSelect}
        collapsed={mediaLibraryCollapsed}
        onToggleCollapse={() => setMediaLibraryCollapsed(!mediaLibraryCollapsed)}
        renamingClipIndex={renamingMediaClipIndex}
        onRename={handleRenameMediaClip}
      />

      {/* Main Content Area - Center */}
      <div className="main-content">
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
      </div>

      {/* Transcript Panel - Right */}
      <TranscriptPanel
        segments={transcriptSegments}
        currentTime={playingClipTime}
        onSeek={seekPlayhead}
        collapsed={transcriptCollapsed}
        onToggleCollapse={() => setTranscriptCollapsed(!transcriptCollapsed)}
        onTranscribe={handleTranscribeVideo}
        isTranscribing={isTranscribing}
        hasVideo={!!playingClip}
        selectedSegmentIndex={selectedSegmentIndex}
        onSegmentSelect={setSelectedSegmentIndex}
      />

      {/* Timeline Section - Bottom Spanning All */}
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
            className="btn-secondary"
            onClick={handleMergeTimeline}
            disabled={timelineClips.length < 2 || isExporting}
            title="Merge all timeline clips into a single clip and add to library"
          >
            {isExporting ? '🔄 Merging...' : '🔗 Merge Timeline'}
          </button>
          <button
            className={`btn-secondary ${isTrimMode ? 'active' : ''}`}
            disabled={timelineClips.length === 0}
            title="Press 't' to start/complete trim at playhead position"
          >
            {trimStartTime !== null ? '✂️ Trimming... (press T)' : '✂️ Trim Mode (press T)'}
          </button>
          <button
            className={`btn-secondary ${isClipMode ? 'active' : ''}`}
            onClick={handleClipModeAction}
            disabled={timelineClips.length === 0 || isExporting}
            title="Click or press 'c' to start/complete clip extraction at playhead position"
          >
            {clipStartTime !== null ? '📋 Extracting... (press C)' : '📋 Clip Mode (press C)'}
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
          isClipMode={isClipMode}
          clipStartTime={clipStartTime}
          renamingClipId={renamingClipId}
          onCompleteRename={handleCompleteRename}
          transcriptSegments={transcriptSegments}
          transcriptClipPath={playingClip?.path}
          transcriptCollapsed={transcriptCollapsed}
          selectedSegmentIndex={selectedSegmentIndex}
          onSegmentSelect={setSelectedSegmentIndex}
        />
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem && (
          <div className="drag-overlay-preview">
            <div className="clip-name">{activeItem.clip?.filename}</div>
            {activeItem.clip?.duration && (
              <div className="clip-meta">{formatTime(activeItem.clip.duration)}</div>
            )}
          </div>
        )}
      </DragOverlay>
    </div>
    </DndContext>
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
