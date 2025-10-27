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

  // Initialize video.js player
  useEffect(() => {
    if (!videoRef.current || !videoPath) return;

    // Dispose of existing player
    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }

    // Initialize video.js with optimized settings
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

    // Set video source using Tauri's custom protocol
    player.src({
      src: convertFileSrc(videoPath),
      type: 'video/mp4'
    });

    // Handle loaded metadata
    player.on('loadedmetadata', () => {
      if (onVideoLoaded) {
        const duration = player.duration();
        const videoWidth = player.videoWidth();
        const videoHeight = player.videoHeight();
        onVideoLoaded({ duration, width: videoWidth, height: videoHeight });
      }
    });

    // Handle time updates
    player.on('timeupdate', () => {
      if (onTimeUpdate) {
        onTimeUpdate(player.currentTime());
      }
    });

    // Handle play/pause state
    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));

    // Cleanup on unmount
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [videoPath, onVideoLoaded, onTimeUpdate]);

  // Handle external currentTime changes
  useEffect(() => {
    if (playerRef.current && currentTime !== undefined) {
      const player = playerRef.current;
      // Only seek if the difference is significant (avoid jitter)
      if (Math.abs(player.currentTime() - currentTime) > 0.1) {
        player.currentTime(currentTime);
      }
    }
  }, [currentTime]);

  // Handle playback rate changes
  const handlePlaybackRateChange = (rate) => {
    if (playerRef.current) {
      playerRef.current.playbackRate(rate);
      setPlaybackRate(rate);
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

  return (
    <div className="video-player">
      {videoPath ? (
        <>
          <div
            className="video-container"
            data-vjs-player
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
          <div className="playback-controls">
            <button
              className={`btn-play-pause ${isPlaying ? 'playing' : 'paused'}`}
              onClick={handlePlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <span className="playback-label">Speed:</span>
            <button
              className={`speed-btn ${playbackRate === 0.5 ? 'active' : ''}`}
              onClick={() => handlePlaybackRateChange(0.5)}
            >
              0.5x
            </button>
            <button
              className={`speed-btn ${playbackRate === 1.0 ? 'active' : ''}`}
              onClick={() => handlePlaybackRateChange(1.0)}
            >
              1x
            </button>
            <button
              className={`speed-btn ${playbackRate === 1.5 ? 'active' : ''}`}
              onClick={() => handlePlaybackRateChange(1.5)}
            >
              1.5x
            </button>
            <button
              className={`speed-btn ${playbackRate === 2.0 ? 'active' : ''}`}
              onClick={() => handlePlaybackRateChange(2.0)}
            >
              2x
            </button>
            <button
              className={`speed-btn ${playbackRate === 3.0 ? 'active' : ''}`}
              onClick={() => handlePlaybackRateChange(3.0)}
            >
              3x
            </button>
            <span className="current-rate">Current: {playbackRate}x</span>
          </div>
        </>
      ) : (
        <div className="video-placeholder">
          <div className="placeholder-content">
            <div className="placeholder-icon">🎬</div>
            <p className="placeholder-text">No video loaded</p>
            <p className="placeholder-hint">Click "Import Video" to get started</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoPlayer;
