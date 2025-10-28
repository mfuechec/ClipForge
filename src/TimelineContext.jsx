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

  // Calculate total timeline duration based on clips
  const totalDuration = useMemo(() => {
    if (timelineClips.length === 0) return 0;

    let maxEndTime = 0;
    timelineClips.forEach(timelineClip => {
      const clip = clips[timelineClip.clipIndex];
      if (clip) {
        const duration = (clip.trimEnd != null && clip.trimStart != null)
          ? clip.trimEnd - clip.trimStart
          : clip.duration;
        const endTime = timelineClip.startTime + duration;
        maxEndTime = Math.max(maxEndTime, endTime);
      }
    });

    console.log('[TimelineContext] Calculated totalDuration:', maxEndTime);
    return maxEndTime;
  }, [timelineClips, clips]);

  // Add a clip to the timeline at a specific time position
  const addClipToTimeline = useCallback((clipIndex, startTime = null, freshClips = null) => {
    // Use fresh clips array passed from caller, or fallback to context clips
    const clipsToUse = freshClips || clips;

    console.log('[TimelineContext] Adding clip', clipIndex, 'to timeline');

    setTimelineClips(prev => {
      // If no start time provided, calculate position by finding end of last clip
      let position = startTime !== null ? startTime : 0;

      if (startTime === null && prev.length > 0) {
        // Calculate the end position of all clips to find where to append
        let maxEndTime = 0;
        prev.forEach((tc) => {
          const clip = clipsToUse[tc.clipIndex];

          if (clip && clip.duration) {
            const duration = (clip.trimEnd != null && clip.trimStart != null)
              ? clip.trimEnd - clip.trimStart
              : clip.duration;
            const endTime = tc.startTime + duration;
            maxEndTime = Math.max(maxEndTime, endTime);
          }
        });
        position = maxEndTime;
      }

      // Safety check: if position is NaN, default to 0
      if (isNaN(position)) {
        console.error('[TimelineContext] Position is NaN! Defaulting to 0');
        position = 0;
      }

      // Create new timeline clip
      const newClip = {
        id: `timeline-clip-${Date.now()}-${Math.random()}`, // Unique ID for drag-and-drop
        clipIndex,
        startTime: position
      };

      console.log('[TimelineContext] Clip added at position:', position);

      return [...prev, newClip];
    });
  }, [clips]);

  // Remove a clip from the timeline
  const removeClipFromTimeline = useCallback((timelineClipId) => {
    setTimelineClips(prev => prev.filter(tc => tc.id !== timelineClipId));
  }, []);

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
    for (const timelineClip of timelineClips) {
      const clip = clips[timelineClip.clipIndex];

      if (!clip) {
        continue;
      }

      const duration = (clip.trimEnd != null && clip.trimStart != null)
        ? clip.trimEnd - clip.trimStart
        : clip.duration;

      const endTime = timelineClip.startTime + duration;

      if (time >= timelineClip.startTime && time < endTime) {
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
    clearTimeline
  };

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}
