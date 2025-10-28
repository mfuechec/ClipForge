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

  // Helper: Calculate duration of a clip (accounting for trim points)
  const calculateDuration = useCallback((clip) => {
    if (!clip) return 0;
    return (clip.trimEnd != null && clip.trimStart != null)
      ? clip.trimEnd - clip.trimStart
      : clip.duration || 0;
  }, []);

  // Helper: Reflow timeline clips to be sequential (no gaps)
  const reflowTimeline = useCallback((timelineClipsArray, clipsArray) => {
    let currentTime = 0;
    return timelineClipsArray.map(tc => {
      const startTime = currentTime;
      currentTime += calculateDuration(clipsArray[tc.clipIndex]);
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
        const duration = calculateDuration(clip);
        const endTime = timelineClip.startTime + duration;
        maxEndTime = Math.max(maxEndTime, endTime);
      }
    });

    console.log('[TimelineContext] Calculated totalDuration:', maxEndTime);
    return maxEndTime;
  }, [timelineClips, clips, calculateDuration]);

  // Add a clip to the timeline at a specific time position
  const addClipToTimeline = useCallback((clipIndex, startTime = null, freshClips = null) => {
    // Use fresh clips array passed from caller, or fallback to context clips
    const clipsToUse = freshClips || clips;

    console.log('[TimelineContext] Adding clip', clipIndex, 'to timeline');

    setTimelineClips(prev => {
      // Create new timeline clip
      const newClip = {
        id: `timeline-clip-${Date.now()}-${Math.random()}`, // Unique ID for drag-and-drop
        clipIndex,
        startTime: 0  // Temporary, will be set by reflow
      };

      // Add to end of timeline
      const updatedClips = [...prev, newClip];

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
  const reorderTimelineClips = useCallback((timelineClipId, newStartTime) => {
    setTimelineClips(prev =>
      prev.map(tc =>
        tc.id === timelineClipId
          ? { ...tc, startTime: newStartTime }
          : tc
      )
    );
  }, []);

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

  // Get the active clip at a given time
  const getActiveClipAtTime = useCallback((time) => {
    // Find the clip that contains this time
    for (let i = 0; i < timelineClips.length; i++) {
      const timelineClip = timelineClips[i];
      const clip = clips[timelineClip.clipIndex];

      if (!clip) {
        continue;
      }

      const duration = (clip.trimEnd != null && clip.trimStart != null)
        ? clip.trimEnd - clip.trimStart
        : clip.duration;

      const endTime = timelineClip.startTime + duration;
      const isLastClip = i === timelineClips.length - 1;

      // For the last clip, include the exact end time (use <=)
      // This keeps the clip active when video reaches the end, allowing replay
      const isInRange = isLastClip
        ? (time >= timelineClip.startTime && time <= endTime)
        : (time >= timelineClip.startTime && time < endTime);

      if (isInRange) {
        // Calculate offset within the clip (accounting for trim)
        const offsetInClip = time - timelineClip.startTime;
        const actualClipTime = (clip.trimStart != null)
          ? clip.trimStart + offsetInClip
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

  const value = {
    // State
    timelineClips,
    playheadTime,
    totalDuration,

    // Actions
    addClipToTimeline,
    removeClipFromTimeline,
    reorderTimelineClips,
    seekPlayhead,
    getActiveClipAtTime,
    clearTimeline,
    handleClipDeleted
  };

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}
