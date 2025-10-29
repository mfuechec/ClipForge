/**
 * Unified timeline utilities
 * Single source of truth for all timeline calculations
 */

// Timeline scaling constants
// At 5 pixels per second, 5 minutes (300s) = 1500px which fits most screens without scrolling
export const PIXELS_PER_SECOND = 5;
export const TRIM_BOUNDARY_TOLERANCE = 0.05; // 50ms tolerance for trim enforcement

/**
 * Convert duration (in seconds) to pixel width
 * @param {number} duration - Duration in seconds
 * @returns {number} Width in pixels
 */
export function getPixelWidth(duration) {
  return duration * PIXELS_PER_SECOND;
}

/**
 * Convert pixel position to time
 * @param {number} pixels - Position in pixels
 * @returns {number} Time in seconds
 */
export function getTimeFromPixels(pixels) {
  return pixels / PIXELS_PER_SECOND;
}

/**
 * Calculate effective duration for a timeline clip
 * Handles both video and audio with unified logic
 *
 * @param {Object} timelineClip - The timeline clip instance
 * @param {Object} sourceClip - The source clip from media library
 * @param {string} type - 'video' or 'audio'
 * @returns {Object} { start, end, duration }
 */
export function calculateClipDuration(timelineClip, sourceClip, type = 'video') {
  let trimStart, trimEnd, duration;

  if (type === 'audio') {
    // Audio can have independent trim values when unlinked
    if (timelineClip.audioTrimStart != null && timelineClip.audioTrimEnd != null) {
      // Audio has been independently trimmed
      trimStart = timelineClip.audioTrimStart;
      trimEnd = timelineClip.audioTrimEnd;
    } else if (timelineClip.trimStart != null && timelineClip.trimEnd != null) {
      // No independent audio trim, use video trim values
      trimStart = timelineClip.trimStart;
      trimEnd = timelineClip.trimEnd;
    } else {
      // No trim at all, use full clip duration
      trimStart = 0;
      trimEnd = sourceClip.duration;
    }
  } else {
    // Video uses standard trim values
    if (timelineClip.trimStart != null && timelineClip.trimEnd != null) {
      trimStart = timelineClip.trimStart;
      trimEnd = timelineClip.trimEnd;
    } else {
      trimStart = 0;
      trimEnd = sourceClip.duration;
    }
  }

  duration = trimEnd - trimStart;

  return { start: trimStart, end: trimEnd, duration };
}

/**
 * Check if current time is within trim boundaries
 * @param {number} currentTime - Current playback time
 * @param {number|null} trimStart - Trim start time (null if no trim)
 * @param {number|null} trimEnd - Trim end time (null if no trim)
 * @returns {Object} { withinBounds, shouldPause, correctedTime }
 */
export function checkTrimBoundaries(currentTime, trimStart, trimEnd) {
  // No trim boundaries
  if (trimStart == null && trimEnd == null) {
    return { withinBounds: true, shouldPause: false, correctedTime: currentTime };
  }

  // Check if we've exceeded the end boundary (with tolerance to catch it early)
  if (trimEnd != null && currentTime >= trimEnd - TRIM_BOUNDARY_TOLERANCE) {
    return {
      withinBounds: false,
      shouldPause: true,
      correctedTime: trimEnd,
      reason: 'exceeded-end'
    };
  }

  // Check if we've gone before the start boundary
  if (trimStart != null && currentTime < trimStart) {
    return {
      withinBounds: false,
      shouldPause: false,
      correctedTime: trimStart,
      reason: 'before-start'
    };
  }

  return { withinBounds: true, shouldPause: false, correctedTime: currentTime };
}

/**
 * Format time in MM:SS or HH:MM:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate timeline position for a clip
 * @param {Object} timelineClip - Timeline clip instance
 * @param {string} type - 'video' or 'audio'
 * @returns {number} Position in seconds
 */
export function calculateClipPosition(timelineClip, type = 'video') {
  if (type === 'audio') {
    // Audio can be offset when unlinked
    return timelineClip.startTime + (timelineClip.isAudioLinked ? 0 : timelineClip.audioOffset);
  }

  return timelineClip.startTime;
}
