import { useRef, useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import './VideoPlayer.css';

function VideoPlayer({ videoPath, onTimeUpdate, currentTime, onVideoLoaded, trimStart, trimEnd }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Store callbacks in refs to avoid recreating player when callbacks change
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onVideoLoadedRef = useRef(onVideoLoaded);
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);

  // Update refs when callbacks change
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
    onVideoLoadedRef.current = onVideoLoaded;
    trimStartRef.current = trimStart;
    trimEndRef.current = trimEnd;
  }, [onTimeUpdate, onVideoLoaded, trimStart, trimEnd]);

  // Initialize player when video element appears, update source when path changes
  useEffect(() => {
    console.log('[VideoPlayer] Effect running - videoPath:', videoPath, 'element exists:', !!videoRef.current);

    // Need element to proceed
    if (!videoRef.current) {
      console.log('[VideoPlayer] Skipping - video element not in DOM yet');
      return;
    }

    // If no videoPath, pause and clear source but keep player alive
    if (!videoPath) {
      if (playerRef.current) {
        console.log('[VideoPlayer] No videoPath - pausing and hiding player');
        try {
          playerRef.current.pause();
        } catch (error) {
          console.warn('[VideoPlayer] Error pausing player:', error);
        }
      }
      setIsPlaying(false);
      return;
    }

    // If player doesn't exist yet, create it
    if (!playerRef.current) {
      console.log('[VideoPlayer] Creating new player');
      const player = videojs(videoRef.current, {
        controls: true,
        autoplay: false,
        preload: 'metadata',
        fluid: false,
        responsive: true,
        playbackRates: [0.5, 1, 1.5, 2, 3],
        html5: {
          vhs: {
            overrideNative: true
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false
        }
      });

      playerRef.current = player;

      // Handle loaded metadata - use ref to get latest callback
      player.on('loadedmetadata', () => {
        if (onVideoLoadedRef.current) {
          const duration = player.duration();
          const videoWidth = player.videoWidth();
          const videoHeight = player.videoHeight();
          onVideoLoadedRef.current({ duration, width: videoWidth, height: videoHeight });
        }
      });

      // Handle time updates - use ref to get latest callback
      player.on('timeupdate', () => {
        const currentTime = player.currentTime();

        if (onTimeUpdateRef.current) {
          onTimeUpdateRef.current(currentTime);
        }

        // Enforce trim boundaries during playback - use refs to get latest values
        const trimStart = trimStartRef.current;
        const trimEnd = trimEndRef.current;

        // trimEnd check: if we've reached the end of the trim range, pause
        if (trimEnd != null && currentTime >= trimEnd) {
          console.log('[VideoPlayer] Reached trim end point, pausing');
          player.pause();
          player.currentTime(trimEnd);
        }

        // trimStart check: if we've gone before the trim start, jump back
        if (trimStart != null && currentTime < trimStart) {
          console.log('[VideoPlayer] Before trim start point, jumping to start');
          player.currentTime(trimStart);
        }
      });

      // Handle play/pause state
      player.on('play', () => {
        setIsPlaying(true);
        // When play starts, ensure we're at or after trimStart - use ref to get latest value
        const trimStart = trimStartRef.current;
        if (trimStart != null && player.currentTime() < trimStart) {
          console.log('[VideoPlayer] Play started before trim start, seeking to:', trimStart);
          player.currentTime(trimStart);
        }
      });
      player.on('pause', () => setIsPlaying(false));

      // Handle video end - pause instead of showing ended state
      player.on('ended', () => {
        console.log('[VideoPlayer] Video ended - pausing to allow replay');
        player.pause();
      });

      console.log('[VideoPlayer] Player created and event listeners attached');
    }

    // Update source (whether player is new or existing)
    console.log('[VideoPlayer] Updating source to:', videoPath);
    playerRef.current.src({
      src: convertFileSrc(videoPath),
      type: 'video/mp4'
    });
  }, [videoPath]); // Only re-run when videoPath changes

  // Cleanup on component unmount only
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        console.log('[VideoPlayer] Disposing player on unmount');
        try {
          playerRef.current.dispose();
        } catch (error) {
          console.warn('[VideoPlayer] Error disposing player on unmount:', error);
        }
        playerRef.current = null;
      }
    };
  }, []);

  // Handle external currentTime changes
  useEffect(() => {
    if (playerRef.current && currentTime !== undefined) {
      const player = playerRef.current;
      let targetTime = currentTime;

      // Constrain to trim boundaries if they exist
      if (trimStart != null && targetTime < trimStart) {
        console.log('[VideoPlayer] External seek before trim start, constraining to:', trimStart);
        targetTime = trimStart;
      }
      if (trimEnd != null && targetTime > trimEnd) {
        console.log('[VideoPlayer] External seek after trim end, constraining to:', trimEnd);
        targetTime = trimEnd;
      }

      // Only seek if the difference is significant (avoid jitter)
      if (Math.abs(player.currentTime() - targetTime) > 0.1) {
        player.currentTime(targetTime);
      }
    }
  }, [currentTime, trimStart, trimEnd]);

  // Handle trim boundary changes - ensure current playback position is valid
  // Only adjust position if it's significantly outside boundaries (avoid micro-adjustments)
  useEffect(() => {
    if (playerRef.current) {
      const player = playerRef.current;
      const currentTime = player.currentTime();

      // Only adjust if significantly outside boundaries (> 0.2 seconds)
      if (trimStart != null && currentTime < trimStart - 0.2) {
        console.log('[VideoPlayer] Trim boundaries changed - current time before new start, seeking to:', trimStart);
        player.currentTime(trimStart);
      } else if (trimEnd != null && currentTime > trimEnd + 0.2) {
        console.log('[VideoPlayer] Trim boundaries changed - current time after new end, seeking to:', trimEnd);
        player.currentTime(trimEnd);
        player.pause(); // Also pause if we're beyond the end
      }
    }
  }, [trimStart, trimEnd]);

  // Handle playback rate changes
  const handlePlaybackRateChange = (rate) => {
    if (playerRef.current) {
      const player = playerRef.current;
      const wasPlaying = !player.paused();

      // Change the playback rate
      player.playbackRate(rate);
      setPlaybackRate(rate);

      // If the video was playing, ensure it continues playing
      if (wasPlaying) {
        // Use a small timeout to ensure the rate change has been applied
        setTimeout(() => {
          if (player && !player.paused()) {
            // Already playing, do nothing
          } else if (player) {
            player.play().catch(err => {
              console.warn('[VideoPlayer] Could not resume playback after rate change:', err);
            });
          }
        }, 0);
      }
    }
  };

  const handlePlayPause = () => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pause();
      } else {
        playerRef.current.play();
      }
    }
  };

  // Handle keyboard shortcuts for video playback
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Don't handle if no video is loaded
      if (!playerRef.current || !videoPath) {
        return;
      }

      const player = playerRef.current;

      // Spacebar - play/pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (player.paused()) {
          player.play();
        } else {
          player.pause();
        }
        return;
      }

      // Arrow keys - seek forward/backward by 1 frame (assuming 30fps = ~0.033s per frame)
      const frameTime = 1 / 30; // One frame at 30fps

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newTime = Math.max(trimStart || 0, player.currentTime() - frameTime);
        player.currentTime(newTime);
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const duration = player.duration();
        const maxTime = trimEnd != null ? Math.min(trimEnd, duration) : duration;
        const newTime = Math.min(maxTime, player.currentTime() + frameTime);
        player.currentTime(newTime);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoPath, trimStart, trimEnd]);

  return (
    <div className="video-player">
      {/* Video element - always in DOM to prevent mount/unmount issues */}
      <div
        className="video-container"
        data-vjs-player
        style={{ display: videoPath ? 'block' : 'none' }}
      >
        <video
          ref={videoRef}
          className="video-js vjs-default-skin vjs-big-play-centered"
          playsInline
          style={{
            width: '100%',
            maxWidth: '90%',
            aspectRatio: '16/9',
            willChange: 'transform',
            transform: 'translateZ(0)',
            borderRadius: '8px'
          }}
        />
      </div>

      {/* Placeholder - only show when no video */}
      {!videoPath && (
        <div className="video-placeholder">
          <div className="placeholder-content">
            <div className="placeholder-icon">🎬</div>
            <p className="placeholder-text">No video loaded</p>
            <p className="placeholder-hint">Add clips to the timeline to preview</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoPlayer;
