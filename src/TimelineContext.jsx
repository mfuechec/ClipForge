import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const TimelineContext = createContext(null);

export function useTimeline() {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error('useTimeline must be used within a TimelineProvider');
  }
  return context;
}

export function TimelineProvider({ children, clips }) {
  const [timelineClips, setTimelineClips] = useState([]);
  const [playheadTime, setPlayheadTime] = useState(0);

  // Debug: Log when clips prop changes
  useEffect(() => {
    console.log('[TimelineContext] Provider received clips:', clips?.length || 0, 'clips');
  }, [clips]);

  // Cleanup effect: Remove timeline clips that reference deleted clips
  // and adjust clipIndex references when clips array changes
  useEffect(() => {
    setTimelineClips(prev => {
      // Filter out timeline clips that reference non-existent clips
      const validClips = prev.filter(tc => {
        const clipExists = clips[tc.clipIndex] !== undefined;
        if (!clipExists) {
          console.log('[TimelineContext] Removing timeline clip - referenced clip no longer exists:', tc.id);
        }
        return clipExists;
      });

      // No need to adjust clipIndex values since they're array indices
      // and will automatically point to the correct clips after deletion
      return validClips;
    });
  }, [clips]);

  // Helper: Calculate duration of a timeline clip (accounting for trim points)
  const calculateDuration = useCallback((timelineClip, clip) => {
    if (!clip) return 0;
    // Use timeline clip's trim points if they exist, otherwise use full clip duration
    return (timelineClip.trimEnd != null && timelineClip.trimStart != null)
      ? timelineClip.trimEnd - timelineClip.trimStart
      : clip.duration || 0;
  }, []);

  // Helper: Reflow timeline clips to be sequential (no gaps)
  const reflowTimeline = useCallback((timelineClipsArray, clipsArray) => {
    let currentTime = 0;
    return timelineClipsArray.map(tc => {
      const startTime = currentTime;
      currentTime += calculateDuration(tc, clipsArray[tc.clipIndex]);
      return { ...tc, startTime };
    });
  }, [calculateDuration]);

  // Calculate total timeline duration based on clips
  const totalDuration = useMemo(() => {
    if (timelineClips.length === 0) return 0;

    let maxEndTime = 0;
    timelineClips.forEach(timelineClip => {
      const clip = clips[timelineClip.clipIndex];
      if (clip) {
        const duration = calculateDuration(timelineClip, clip);
        const endTime = timelineClip.startTime + duration;
        maxEndTime = Math.max(maxEndTime, endTime);
      }
    });

    console.log('[TimelineContext] Calculated totalDuration:', maxEndTime);
    return maxEndTime;
  }, [timelineClips, clips, calculateDuration]);

  // Add a clip to the timeline at a specific time position or index
  const addClipToTimeline = useCallback((clipIndex, startTime = null, freshClips = null, insertAtIndex = null) => {
    // Use fresh clips array passed from caller, or fallback to context clips
    const clipsToUse = freshClips || clips;

    console.log('[TimelineContext] Adding clip', clipIndex, 'to timeline at index', insertAtIndex);

    setTimelineClips(prev => {
      // Create new timeline clip with no trim points (use full clip)
      const newClip = {
        id: `timeline-clip-${Date.now()}-${Math.random()}`, // Unique ID for drag-and-drop
        clipIndex,
        startTime: 0,  // Temporary, will be set by reflow
        trimStart: null,  // No trim initially (applies to video, or both when linked)
        trimEnd: null,    // No trim initially (applies to video, or both when linked)
        audioTrimStart: null,  // Audio-specific trim start (used when audio is unlinked)
        audioTrimEnd: null,    // Audio-specific trim end (used when audio is unlinked)
        customName: null,  // No custom name initially
        isAudioLinked: true,  // Audio and video are linked by default
        audioOffset: 0,  // Audio offset in seconds when unlinked
        isVideoMuted: false,  // Video is not muted by default
        isAudioMuted: false  // Audio is not muted by default
      };

      // Insert at specific index or add to end of timeline
      let updatedClips;
      if (insertAtIndex !== null && insertAtIndex >= 0 && insertAtIndex <= prev.length) {
        updatedClips = [
          ...prev.slice(0, insertAtIndex),
          newClip,
          ...prev.slice(insertAtIndex)
        ];
      } else {
        updatedClips = [...prev, newClip];
      }

      // Reflow to ensure sequential arrangement
      const reflowedClips = reflowTimeline(updatedClips, clipsToUse);

      console.log('[TimelineContext] Clip added and timeline reflowed');

      return reflowedClips;
    });
  }, [clips, reflowTimeline]);

  // Remove a clip from the timeline
  const removeClipFromTimeline = useCallback((timelineClipId) => {
    console.log('[TimelineContext] Removing clip', timelineClipId, 'from timeline');

    setTimelineClips(prev => {
      // Remove the clip
      const filtered = prev.filter(tc => tc.id !== timelineClipId);

      // Reflow remaining clips to be sequential
      const reflowedClips = reflowTimeline(filtered, clips);

      console.log('[TimelineContext] Timeline reflowed after removal');

      return reflowedClips;
    });
  }, [clips, reflowTimeline]);

  // Reorder clips on the timeline (for drag-and-drop within timeline)
  const reorderTimelineClips = useCallback((timelineClipId, newIndex) => {
    console.log('[TimelineContext] Reordering clip', timelineClipId, 'to index', newIndex);

    setTimelineClips(prev => {
      // Find the clip being moved
      const clipIndex = prev.findIndex(tc => tc.id === timelineClipId);
      if (clipIndex === -1) {
        console.error('[TimelineContext] Clip not found:', timelineClipId);
        return prev;
      }

      // If index hasn't changed, no need to reorder
      if (clipIndex === newIndex) {
        return prev;
      }

      // Remove the clip from its current position
      const clip = prev[clipIndex];
      const withoutClip = [...prev.slice(0, clipIndex), ...prev.slice(clipIndex + 1)];

      // Insert at new position
      const reordered = [
        ...withoutClip.slice(0, newIndex),
        clip,
        ...withoutClip.slice(newIndex)
      ];

      // Reflow to update start times
      const reflowedClips = reflowTimeline(reordered, clips);

      console.log('[TimelineContext] Timeline clips reordered and reflowed');

      return reflowedClips;
    });
  }, [clips, reflowTimeline]);

  // Seek playhead to a specific time
  const seekPlayhead = useCallback((time) => {
    console.log('[TimelineContext] seekPlayhead called with time:', time);
    console.log('[TimelineContext] totalDuration:', totalDuration);

    // Safety check: prevent NaN
    if (isNaN(time)) {
      console.error('[TimelineContext] Attempted to seek to NaN time! Ignoring.');
      return;
    }

    // If totalDuration is NaN or 0, just use the time directly (clamped to >= 0)
    const maxTime = (totalDuration && !isNaN(totalDuration)) ? totalDuration : Infinity;
    const clampedTime = Math.max(0, Math.min(time, maxTime));

    console.log('[TimelineContext] Clamping to range: 0 -', maxTime);
    console.log('[TimelineContext] Setting playhead to:', clampedTime);

    if (isNaN(clampedTime)) {
      console.error('[TimelineContext] Clamped time is NaN! Aborting seek.');
      return;
    }

    setPlayheadTime(clampedTime);
  }, [totalDuration]);

  // Get audio segments that should be playing for a given video clip
  // Returns array of {start, end} ranges where audio should be unmuted
  const getAudioSegmentsForClip = useCallback((videoTimelineClip) => {
    if (!videoTimelineClip) return null;

    const clip = clips[videoTimelineClip.clipIndex];
    if (!clip) return null;

    // Start with the video clip's own audio range
    const audioTrimStart = videoTimelineClip.audioTrimStart ?? videoTimelineClip.trimStart ?? 0;
    const audioTrimEnd = videoTimelineClip.audioTrimEnd ?? videoTimelineClip.trimEnd ?? clip.duration;

    const segments = [{
      start: audioTrimStart,
      end: audioTrimEnd
    }];

    // Look for audio-only clips (zero-duration video) from the same source
    // After Shift-T middle trim, the second audio clip is ADJACENT (next in sequence)
    const currentIndex = timelineClips.findIndex(tc => tc.id === videoTimelineClip.id);

    console.log('[TimelineContext] Looking for audio segments for clip', currentIndex, {
      clipIndex: videoTimelineClip.clipIndex,
      totalTimelineClips: timelineClips.length
    });

    for (let i = 0; i < timelineClips.length; i++) {
      const tc = timelineClips[i];

      // Skip self
      if (tc.id === videoTimelineClip.id) continue;

      // Check if it's from the same source clip
      if (tc.clipIndex !== videoTimelineClip.clipIndex) continue;

      // Check if it's an audio-only clip (zero video duration)
      const tcDuration = (tc.trimEnd ?? clip.duration) - (tc.trimStart ?? 0);
      console.log('[TimelineContext] Checking clip', i, {
        id: tc.id,
        duration: tcDuration,
        audioTrimStart: tc.audioTrimStart,
        audioTrimEnd: tc.audioTrimEnd,
        isAdjacent: i === currentIndex + 1
      });

      if (tcDuration > 0) continue; // Has video, not audio-only

      // If this is an adjacent audio-only clip from the same source, it's part of a middle trim
      // Add its audio segment (these are in source video time, not timeline time)
      if (i === currentIndex + 1) {
        const audioTrimStart = tc.audioTrimStart ?? 0;
        const audioTrimEnd = tc.audioTrimEnd ?? clip.duration;

        console.log('[TimelineContext] Found adjacent audio-only clip! Adding segment:', {
          start: audioTrimStart,
          end: audioTrimEnd
        });

        segments.push({
          start: audioTrimStart,
          end: audioTrimEnd
        });
      }
    }

    console.log('[TimelineContext] Final audio segments:', segments);
    return segments;
  }, [timelineClips, clips]);

  // Get the active clip at a given time
  const getActiveClipAtTime = useCallback((time) => {
    // Find the clip that contains this time
    for (let i = 0; i < timelineClips.length; i++) {
      const timelineClip = timelineClips[i];
      const clip = clips[timelineClip.clipIndex];

      if (!clip) {
        continue;
      }

      // Use timeline clip's trim points
      const duration = (timelineClip.trimEnd != null && timelineClip.trimStart != null)
        ? timelineClip.trimEnd - timelineClip.trimStart
        : clip.duration;

      // Skip clips with zero video duration (audio-only clips)
      if (duration <= 0) {
        continue;
      }

      const endTime = timelineClip.startTime + duration;
      const isLastClip = i === timelineClips.length - 1;

      // For the last clip, include the exact end time (use <=)
      // This keeps the clip active when video reaches the end, allowing replay
      const isInRange = isLastClip
        ? (time >= timelineClip.startTime && time <= endTime)
        : (time >= timelineClip.startTime && time < endTime);

      if (isInRange) {
        // Calculate offset within the clip (accounting for timeline clip's trim)
        const offsetInClip = time - timelineClip.startTime;
        const actualClipTime = (timelineClip.trimStart != null)
          ? timelineClip.trimStart + offsetInClip
          : offsetInClip;

        return {
          timelineClip,
          clip,
          offsetInClip: actualClipTime
        };
      }
    }

    return null;
  }, [timelineClips, clips]);

  // Update trim points for a specific timeline clip
  const updateTimelineClipTrim = useCallback((timelineClipId, trimStart, trimEnd) => {
    console.log('[TimelineContext] Updating trim for timeline clip', timelineClipId, 'to:', { trimStart, trimEnd });

    setTimelineClips(prev => {
      // Update the trim points for the specified timeline clip
      const updated = prev.map(tc =>
        tc.id === timelineClipId
          ? { ...tc, trimStart, trimEnd }
          : tc
      );

      // Reflow to adjust positions based on new durations
      const reflowedClips = reflowTimeline(updated, clips);

      console.log('[TimelineContext] Timeline clip trim updated and reflowed');

      return reflowedClips;
    });
  }, [clips, reflowTimeline]);

  // Update audio-only trim points for a specific timeline clip
  const updateTimelineClipAudioTrim = useCallback((timelineClipId, audioTrimStart, audioTrimEnd) => {
    console.log('[TimelineContext] Updating audio trim for timeline clip', timelineClipId, 'to:', { audioTrimStart, audioTrimEnd });

    setTimelineClips(prev =>
      prev.map(tc =>
        tc.id === timelineClipId
          ? { ...tc, audioTrimStart, audioTrimEnd }
          : tc
      )
    );
    // Note: We don't reflow for audio-only trim changes since they don't affect timeline duration
  }, []);

  // Split a timeline clip by removing a middle section
  const splitTimelineClip = useCallback((timelineClipId, removeStart, removeEnd) => {
    console.log('[TimelineContext] Splitting timeline clip', timelineClipId, 'removing:', { removeStart, removeEnd });

    setTimelineClips(prev => {
      // Find the clip to split
      const clipIndex = prev.findIndex(tc => tc.id === timelineClipId);
      if (clipIndex === -1) {
        console.error('[TimelineContext] Timeline clip not found:', timelineClipId);
        return prev;
      }

      const originalClip = prev[clipIndex];
      const clip = clips[originalClip.clipIndex];

      if (!clip) {
        console.error('[TimelineContext] Source clip not found');
        return prev;
      }

      const currentTrimStart = originalClip.trimStart ?? 0;
      const currentTrimEnd = originalClip.trimEnd ?? clip.duration;
      const currentAudioTrimStart = originalClip.audioTrimStart ?? originalClip.trimStart ?? 0;
      const currentAudioTrimEnd = originalClip.audioTrimEnd ?? originalClip.trimEnd ?? clip.duration;

      // Create two new clips from the split
      const firstClip = {
        id: `timeline-clip-${Date.now()}-${Math.random()}-first`,
        clipIndex: originalClip.clipIndex,
        startTime: 0, // Will be set by reflow
        trimStart: currentTrimStart,
        trimEnd: currentTrimStart + removeStart,
        audioTrimStart: currentAudioTrimStart,
        audioTrimEnd: currentAudioTrimStart + removeStart,
        customName: originalClip.customName,
        isAudioLinked: originalClip.isAudioLinked,
        audioOffset: originalClip.audioOffset,
        isVideoMuted: originalClip.isVideoMuted,
        isAudioMuted: originalClip.isAudioMuted
      };

      const secondClip = {
        id: `timeline-clip-${Date.now()}-${Math.random()}-second`,
        clipIndex: originalClip.clipIndex,
        startTime: 0, // Will be set by reflow
        trimStart: currentTrimStart + removeEnd,
        trimEnd: currentTrimEnd,
        audioTrimStart: currentAudioTrimStart + removeEnd,
        audioTrimEnd: currentAudioTrimEnd,
        customName: originalClip.customName,
        isAudioLinked: originalClip.isAudioLinked,
        audioOffset: originalClip.audioOffset,
        isVideoMuted: originalClip.isVideoMuted,
        isAudioMuted: originalClip.isAudioMuted
      };

      // Replace the original clip with the two new clips
      const updated = [
        ...prev.slice(0, clipIndex),
        firstClip,
        secondClip,
        ...prev.slice(clipIndex + 1)
      ];

      // Reflow to adjust positions
      const reflowedClips = reflowTimeline(updated, clips);

      console.log('[TimelineContext] Timeline clip split and reflowed');

      return reflowedClips;
    });
  }, [clips, reflowTimeline]);

  // Split a timeline clip's audio only (video stays intact)
  const splitTimelineClipAudioOnly = useCallback((timelineClipId, removeStart, removeEnd) => {
    console.log('[TimelineContext] Splitting audio only for timeline clip', timelineClipId, 'removing:', { removeStart, removeEnd });

    setTimelineClips(prev => {
      // Find the clip to split
      const clipIndex = prev.findIndex(tc => tc.id === timelineClipId);
      if (clipIndex === -1) {
        console.error('[TimelineContext] Timeline clip not found:', timelineClipId);
        return prev;
      }

      const originalClip = prev[clipIndex];
      const clip = clips[originalClip.clipIndex];

      if (!clip) {
        console.error('[TimelineContext] Source clip not found');
        return prev;
      }

      const currentTrimStart = originalClip.trimStart ?? 0;
      const currentTrimEnd = originalClip.trimEnd ?? clip.duration;
      const currentAudioTrimStart = originalClip.audioTrimStart ?? originalClip.trimStart ?? 0;
      const currentAudioTrimEnd = originalClip.audioTrimEnd ?? originalClip.trimEnd ?? clip.duration;
      const videoDuration = currentTrimEnd - currentTrimStart;

      // Create two clips:
      // First clip: full video with first part of audio
      const firstClip = {
        id: `timeline-clip-${Date.now()}-${Math.random()}-first`,
        clipIndex: originalClip.clipIndex,
        startTime: 0, // Will be set by reflow
        trimStart: currentTrimStart,
        trimEnd: currentTrimEnd, // Video stays full range
        audioTrimStart: currentAudioTrimStart,
        audioTrimEnd: currentAudioTrimStart + removeStart, // Audio trimmed to first part
        customName: originalClip.customName,
        isAudioLinked: true, // Audio is linked (positioned at start of video)
        audioOffset: 0,
        isVideoMuted: originalClip.isVideoMuted,
        isAudioMuted: originalClip.isAudioMuted
      };

      // Second clip: NO video (zero duration), second part of audio
      // The video is completely trimmed out so it doesn't take timeline space
      // Audio is unlinked and positioned to align with where it was in the original video
      const secondClip = {
        id: `timeline-clip-${Date.now()}-${Math.random()}-second`,
        clipIndex: originalClip.clipIndex,
        startTime: 0, // Will be set by reflow (will be right after first clip)
        trimStart: currentTrimEnd, // Video trimmed to nothing (start = end)
        trimEnd: currentTrimEnd,
        audioTrimStart: currentAudioTrimStart + removeEnd, // Audio starts at removed section end
        audioTrimEnd: currentAudioTrimEnd,
        customName: originalClip.customName,
        isAudioLinked: false, // Audio is UNLINKED so we can position it independently
        audioOffset: -(videoDuration) + removeEnd, // Position audio relative to where the video would be
        isVideoMuted: true, // Video is muted (though it has zero duration anyway)
        isAudioMuted: originalClip.isAudioMuted
      };

      // Replace the original clip with the two new clips
      const updated = [
        ...prev.slice(0, clipIndex),
        firstClip,
        secondClip,
        ...prev.slice(clipIndex + 1)
      ];

      // Reflow to adjust positions
      const reflowedClips = reflowTimeline(updated, clips);

      console.log('[TimelineContext] Timeline clip audio split:', {
        videoDuration,
        firstAudio: `${firstClip.audioTrimStart}-${firstClip.audioTrimEnd}`,
        secondAudio: `${secondClip.audioTrimStart}-${secondClip.audioTrimEnd}`,
        secondAudioOffset: secondClip.audioOffset
      });

      return reflowedClips;
    });
  }, [clips, reflowTimeline]);

  // Clear the entire timeline
  const clearTimeline = useCallback(() => {
    setTimelineClips([]);
    setPlayheadTime(0);
  }, []);

  // Handle clip deletion from library - remove timeline clips and adjust indices
  const handleClipDeleted = useCallback((deletedClipIndex) => {
    setTimelineClips(prev => {
      // Remove timeline clips that reference the deleted clip
      const filtered = prev.filter(tc => tc.clipIndex !== deletedClipIndex);

      // Adjust clipIndex for remaining clips that had higher indices
      const adjusted = filtered.map(tc => ({
        ...tc,
        clipIndex: tc.clipIndex > deletedClipIndex ? tc.clipIndex - 1 : tc.clipIndex
      }));

      // Reflow to maintain sequential arrangement
      return reflowTimeline(adjusted, clips);
    });
  }, [clips, reflowTimeline]);

  // Calculate extraction parameters for a clip section
  // Returns the source clip and the exact trim points to extract
  const getClipExtractionParams = useCallback((timelineClipId, extractStart, extractEnd) => {
    const timelineClip = timelineClips.find(tc => tc.id === timelineClipId);
    if (!timelineClip) {
      return null;
    }

    const clip = clips[timelineClip.clipIndex];
    if (!clip) {
      return null;
    }

    // Account for existing trim points on the timeline clip
    const currentTrimStart = timelineClip.trimStart ?? 0;
    const currentTrimEnd = timelineClip.trimEnd ?? clip.duration;

    // Calculate absolute timestamps in the source video
    const absoluteStart = currentTrimStart + extractStart;
    const absoluteEnd = currentTrimStart + extractEnd;

    // Clamp to valid range
    const clampedStart = Math.max(0, Math.min(absoluteStart, clip.duration));
    const clampedEnd = Math.max(clampedStart, Math.min(absoluteEnd, clip.duration));

    return {
      sourceClip: clip,
      trimStart: clampedStart,
      trimEnd: clampedEnd,
      duration: clampedEnd - clampedStart
    };
  }, [timelineClips, clips]);

  // Rename a timeline clip
  const renameTimelineClip = useCallback((timelineClipId, customName) => {
    console.log('[TimelineContext] Renaming timeline clip', timelineClipId, 'to:', customName);

    setTimelineClips(prev =>
      prev.map(tc =>
        tc.id === timelineClipId
          ? { ...tc, customName: customName || null }
          : tc
      )
    );
  }, []);

  // Toggle audio link (link/unlink audio from video)
  const toggleAudioLink = useCallback((timelineClipId) => {
    console.log('[TimelineContext] Toggling audio link for clip', timelineClipId);

    setTimelineClips(prev =>
      prev.map(tc =>
        tc.id === timelineClipId
          ? { ...tc, isAudioLinked: !tc.isAudioLinked, audioOffset: tc.isAudioLinked ? tc.audioOffset : 0 }
          : tc
      )
    );
  }, []);

  // Update audio offset (when audio is unlinked)
  const updateAudioOffset = useCallback((timelineClipId, offset) => {
    console.log('[TimelineContext] Updating audio offset for clip', timelineClipId, 'to:', offset);

    setTimelineClips(prev =>
      prev.map(tc =>
        tc.id === timelineClipId
          ? { ...tc, audioOffset: offset }
          : tc
      )
    );
  }, []);

  // Toggle video mute
  const toggleVideoMute = useCallback((timelineClipId) => {
    console.log('[TimelineContext] Toggling video mute for clip', timelineClipId);

    setTimelineClips(prev =>
      prev.map(tc =>
        tc.id === timelineClipId
          ? { ...tc, isVideoMuted: !tc.isVideoMuted }
          : tc
      )
    );
  }, []);

  // Toggle audio mute
  const toggleAudioMute = useCallback((timelineClipId) => {
    console.log('[TimelineContext] Toggling audio mute for clip', timelineClipId);

    setTimelineClips(prev =>
      prev.map(tc =>
        tc.id === timelineClipId
          ? { ...tc, isAudioMuted: !tc.isAudioMuted }
          : tc
      )
    );
  }, []);

  const value = {
    // State
    timelineClips,
    playheadTime,
    totalDuration,

    // Actions
    addClipToTimeline,
    removeClipFromTimeline,
    reorderTimelineClips,
    updateTimelineClipTrim,
    updateTimelineClipAudioTrim,
    splitTimelineClip,
    splitTimelineClipAudioOnly,
    renameTimelineClip,
    seekPlayhead,
    getActiveClipAtTime,
    getAudioSegmentsForClip,
    clearTimeline,
    handleClipDeleted,
    getClipExtractionParams,

    // Audio/Video separation actions
    toggleAudioLink,
    updateAudioOffset,
    toggleVideoMute,
    toggleAudioMute
  };

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}
