use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Child, Stdio};
use std::fs::File;
use std::io::Write;
use std::sync::Mutex;
use tauri::State;

// Native video player module removed - using video.js in frontend instead
// mod video_player;

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoMetadata {
    path: String,
    filename: String,
    duration: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
}

#[tauri::command]
fn import_video(path: String) -> Result<VideoMetadata, String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err("File does not exist".to_string());
    }

    let filename = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // For MVP, return basic metadata without FFmpeg
    // We'll add FFmpeg later for proper duration/resolution
    Ok(VideoMetadata {
        path: path.clone(),
        filename,
        duration: None,
        width: None,
        height: None,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    input_path: String,
    output_path: String,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
}

#[tauri::command]
fn export_video(options: ExportOptions) -> Result<String, String> {
    log::info!("Starting export: {:?}", options);

    // Check if input file exists
    if !PathBuf::from(&options.input_path).exists() {
        return Err("Input file does not exist".to_string());
    }

    // Build FFmpeg command
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-i").arg(&options.input_path);

    // Add trim parameters if specified
    if let (Some(start), Some(end)) = (options.trim_start, options.trim_end) {
        let duration = end - start;
        cmd.arg("-ss").arg(start.to_string());
        cmd.arg("-t").arg(duration.to_string());
    }

    // Output options
    cmd.arg("-c:v").arg("libx264")
        .arg("-preset").arg("fast")
        .arg("-crf").arg("23")
        .arg("-c:a").arg("aac")
        .arg("-b:a").arg("128k")
        .arg("-y") // Overwrite output file
        .arg(&options.output_path);

    log::info!("Running FFmpeg command: {:?}", cmd);

    // Execute FFmpeg
    let output = cmd.output().map_err(|e| {
        format!("Failed to execute FFmpeg. Make sure FFmpeg is installed. Error: {}", e)
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("FFmpeg failed: {}", stderr);
        return Err(format!("FFmpeg export failed: {}", stderr));
    }

    log::info!("Export successful: {}", options.output_path);
    Ok(options.output_path)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClipSegment {
    input_path: String,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MultiClipExportOptions {
    clips: Vec<ClipSegment>,
    output_path: String,
}

#[tauri::command]
fn export_multi_clip(options: MultiClipExportOptions) -> Result<String, String> {
    log::info!("Starting multi-clip export with {} clips", options.clips.len());

    if options.clips.is_empty() {
        return Err("No clips to export".to_string());
    }

    // For a single clip, use the simple export path
    if options.clips.len() == 1 {
        let clip = &options.clips[0];
        return export_video(ExportOptions {
            input_path: clip.input_path.clone(),
            output_path: options.output_path.clone(),
            trim_start: clip.trim_start,
            trim_end: clip.trim_end,
        });
    }

    // For multiple clips, we need to:
    // 1. Export each trimmed clip to a temp file
    // 2. Concat all temp files
    // 3. Clean up temp files

    let temp_dir = std::env::temp_dir();
    let mut temp_files: Vec<PathBuf> = Vec::new();

    // Step 1: Export each clip with trim applied
    for (i, clip) in options.clips.iter().enumerate() {
        let temp_path = temp_dir.join(format!("clipforge_temp_{}.mp4", i));

        log::info!("Exporting clip {} to temp file: {:?}", i, temp_path);

        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-i").arg(&clip.input_path);

        // Add trim parameters if specified
        if let (Some(start), Some(end)) = (clip.trim_start, clip.trim_end) {
            let duration = end - start;
            cmd.arg("-ss").arg(start.to_string());
            cmd.arg("-t").arg(duration.to_string());
        }

        // Output options - re-encode to ensure compatibility
        cmd.arg("-c:v").arg("libx264")
            .arg("-preset").arg("fast")
            .arg("-crf").arg("23")
            .arg("-c:a").arg("aac")
            .arg("-b:a").arg("128k")
            .arg("-y")
            .arg(&temp_path);

        let output = cmd.output().map_err(|e| {
            format!("Failed to execute FFmpeg for clip {}: {}", i, e)
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::error!("FFmpeg failed for clip {}: {}", i, stderr);
            // Clean up temp files
            for temp_file in &temp_files {
                let _ = std::fs::remove_file(temp_file);
            }
            return Err(format!("FFmpeg export failed for clip {}: {}", i, stderr));
        }

        temp_files.push(temp_path);
    }

    // Step 2: Create concat file
    let concat_file_path = temp_dir.join("clipforge_concat.txt");
    let mut concat_file = File::create(&concat_file_path).map_err(|e| {
        format!("Failed to create concat file: {}", e)
    })?;

    for temp_file in &temp_files {
        writeln!(concat_file, "file '{}'", temp_file.to_string_lossy()).map_err(|e| {
            format!("Failed to write to concat file: {}", e)
        })?;
    }
    drop(concat_file); // Close the file

    log::info!("Created concat file: {:?}", concat_file_path);

    // Step 3: Concat all clips
    let mut concat_cmd = Command::new("ffmpeg");
    concat_cmd
        .arg("-f").arg("concat")
        .arg("-safe").arg("0")
        .arg("-i").arg(&concat_file_path)
        .arg("-c").arg("copy") // Copy without re-encoding
        .arg("-y")
        .arg(&options.output_path);

    log::info!("Running concat command: {:?}", concat_cmd);

    let concat_output = concat_cmd.output().map_err(|e| {
        format!("Failed to execute FFmpeg concat: {}", e)
    })?;

    // Clean up temp files
    for temp_file in &temp_files {
        let _ = std::fs::remove_file(temp_file);
    }
    let _ = std::fs::remove_file(&concat_file_path);

    if !concat_output.status.success() {
        let stderr = String::from_utf8_lossy(&concat_output.stderr);
        log::error!("FFmpeg concat failed: {}", stderr);
        return Err(format!("FFmpeg concat failed: {}", stderr));
    }

    log::info!("Multi-clip export successful: {}", options.output_path);
    Ok(options.output_path)
}

// Recording state management
struct RecordingState {
    process: Mutex<Option<Child>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioDevice {
    id: String,
    name: String,
    #[serde(rename = "type")]
    device_type: String, // "input", "output", "virtual"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioSettings {
    microphone_enabled: bool,
    microphone_device: String,
    system_audio_enabled: bool,
    system_audio_device: String,
    audio_quality: String, // "voice", "standard", "high"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StartRecordingOptions {
    mode: String, // "screen", "webcam", or "combo"
    output_path: String,
    audio_settings: Option<AudioSettings>,
}

#[tauri::command]
fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    log::info!("Listing audio devices");

    #[cfg(target_os = "macos")]
    {
        // Use FFmpeg to list AVFoundation devices
        let output = Command::new("ffmpeg")
            .arg("-f").arg("avfoundation")
            .arg("-list_devices").arg("true")
            .arg("-i").arg("")
            .output()
            .map_err(|e| format!("Failed to list devices: {}", e))?;

        let stderr = String::from_utf8_lossy(&output.stderr);
        let mut devices = Vec::new();

        // Parse FFmpeg output for audio devices
        // Example: [AVFoundation indev @ ...] [1] Built-in Microphone
        let mut in_audio_section = false;
        for line in stderr.lines() {
            if line.contains("AVFoundation audio devices:") {
                in_audio_section = true;
                continue;
            }
            if line.contains("AVFoundation video devices:") {
                in_audio_section = false;
            }

            if in_audio_section {
                // Look for lines with device format: [N] Device Name
                // Skip lines that contain "AVFoundation" or "error"
                if line.contains("AVFoundation") || line.to_lowercase().contains("error") {
                    continue;
                }

                // Find the last '[' and ']' pair (device ID)
                if let Some(bracket_start) = line.rfind('[') {
                    if let Some(bracket_end) = line.rfind(']') {
                        if bracket_end > bracket_start + 1 && bracket_start > 5 {
                            let id = &line[bracket_start + 1..bracket_end];
                            let name = line[bracket_end + 1..].trim();

                            // Validate: ID should be a number, name should not be empty
                            if id.parse::<u32>().is_ok() && !name.is_empty() {
                                // Detect virtual audio devices
                                let device_type = if name.to_lowercase().contains("blackhole")
                                    || name.to_lowercase().contains("soundflower")
                                    || name.to_lowercase().contains("loopback") {
                                    "virtual"
                                } else {
                                    "input"
                                };

                                devices.push(AudioDevice {
                                    id: id.to_string(),
                                    name: name.to_string(),
                                    device_type: device_type.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }

        // Always include a default device if none found
        if devices.is_empty() {
            devices.push(AudioDevice {
                id: "0".to_string(),
                name: "Default Microphone".to_string(),
                device_type: "input".to_string(),
            });
        }

        log::info!("Found {} audio devices", devices.len());
        Ok(devices)
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Fallback for other platforms
        Ok(vec![
            AudioDevice {
                id: "0".to_string(),
                name: "Default Microphone".to_string(),
                device_type: "input".to_string(),
            }
        ])
    }
}

#[tauri::command]
fn start_recording(options: StartRecordingOptions, state: State<RecordingState>) -> Result<String, String> {
    log::info!("Starting recording: {:?}", options);

    let mut recording_process = state.process.lock().unwrap();
    if recording_process.is_some() {
        return Err("Recording already in progress".to_string());
    }

    // Build FFmpeg command based on platform and mode
    let mut cmd = Command::new("ffmpeg");

    #[cfg(target_os = "macos")]
    {
        // Get audio settings or use defaults
        let audio_settings = options.audio_settings.as_ref();
        let mic_enabled = audio_settings.map(|s| s.microphone_enabled).unwrap_or(true);
        let mic_device = audio_settings
            .and_then(|s| {
                if s.microphone_device == "default" {
                    Some("0")
                } else {
                    Some(s.microphone_device.as_str())
                }
            })
            .unwrap_or("0");

        // Only enable system audio if enabled AND a valid device is selected
        let sys_audio_enabled = audio_settings
            .map(|s| {
                s.system_audio_enabled
                && !s.system_audio_device.is_empty()
                && s.system_audio_device != "none"
            })
            .unwrap_or(false);

        match options.mode.as_str() {
            "screen" => {
                cmd.arg("-f").arg("avfoundation")
                    .arg("-capture_cursor").arg("1")
                    .arg("-framerate").arg("30");

                // Handle dual audio (mic + system) vs single audio source
                if mic_enabled && sys_audio_enabled {
                    // Dual audio: Capture screen video + mic + system audio separately, then mix
                    let sys_audio_device = audio_settings
                        .and_then(|s| {
                            if s.system_audio_device == "none" || s.system_audio_device.is_empty() {
                                None
                            } else {
                                Some(s.system_audio_device.as_str())
                            }
                        })
                        .unwrap_or("1"); // Default to device 1 for system audio

                    // Screen video with no audio first
                    cmd.arg("-i").arg("1:none");

                    // Microphone audio input
                    cmd.arg("-f").arg("avfoundation")
                        .arg("-i").arg(&format!(":{}", mic_device));

                    // System audio input (BlackHole or similar)
                    cmd.arg("-f").arg("avfoundation")
                        .arg("-i").arg(&format!(":{}", sys_audio_device));
                } else if mic_enabled {
                    // Just microphone
                    cmd.arg("-i").arg(&format!("1:{}", mic_device));
                } else if sys_audio_enabled {
                    // Just system audio
                    let sys_audio_device = audio_settings
                        .and_then(|s| {
                            if s.system_audio_device == "none" || s.system_audio_device.is_empty() {
                                None
                            } else {
                                Some(s.system_audio_device.as_str())
                            }
                        })
                        .unwrap_or("1");
                    cmd.arg("-i").arg(&format!("1:{}", sys_audio_device));
                } else {
                    // No audio
                    cmd.arg("-i").arg("1:none");
                }
            },
            "webcam" => {
                // For webcam, use the selected mic device or default
                let audio_input = if mic_enabled {
                    format!("0:{}", mic_device)
                } else {
                    "0:none".to_string()
                };

                cmd.arg("-f").arg("avfoundation")
                    .arg("-framerate").arg("30")
                    .arg("-i").arg(&audio_input);
            },
            "combo" => {
                // For combo, use screen with audio
                let audio_input = if mic_enabled {
                    format!("1:{}", mic_device)
                } else {
                    "1:none".to_string()
                };

                cmd.arg("-f").arg("avfoundation")
                    .arg("-capture_cursor").arg("1")
                    .arg("-framerate").arg("30")
                    .arg("-i").arg(&audio_input);
            },
            _ => return Err("Invalid recording mode".to_string()),
        }
    }

    #[cfg(target_os = "windows")]
    {
        match options.mode.as_str() {
            "screen" => {
                cmd.arg("-f").arg("gdigrab")
                    .arg("-i").arg("desktop")
                    .arg("-r").arg("30");
            },
            "webcam" => {
                cmd.arg("-f").arg("dshow")
                    .arg("-i").arg("video=") // User needs to specify device
                    .arg("-r").arg("30");
            },
            _ => return Err("Invalid recording mode".to_string()),
        }
    }

    #[cfg(target_os = "linux")]
    {
        match options.mode.as_str() {
            "screen" => {
                cmd.arg("-f").arg("x11grab")
                    .arg("-i").arg(":0.0")
                    .arg("-r").arg("30");
            },
            "webcam" => {
                cmd.arg("-f").arg("v4l2")
                    .arg("-i").arg("/dev/video0")
                    .arg("-r").arg("30");
            },
            _ => return Err("Invalid recording mode".to_string()),
        }
    }

    // Output settings: H.264/MP4 optimized for smooth browser playback
    // Scale down to 1080p max for smooth playback, ensure even dimensions for H.264
    cmd.arg("-vf").arg("scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2")
        .arg("-c:v").arg("libx264")
        .arg("-preset").arg("veryfast") // Balanced encoding: fast recording + smooth playback
        .arg("-tune").arg("fastdecode") // Optimize for decode performance
        .arg("-profile:v").arg("main") // Main profile for better hardware decode support
        .arg("-level").arg("4.0") // Level 4.0 = max 1080p60, ensures hardware decode
        .arg("-crf").arg("23") // Quality
        .arg("-pix_fmt").arg("yuv420p") // Standard pixel format
        // CRITICAL: Force constant frame rate at 30fps
        .arg("-r").arg("30")
        .arg("-vsync").arg("cfr")
        .arg("-g").arg("30") // GOP size = framerate for consistent keyframes
        .arg("-bf").arg("0") // No B-frames for simpler decode
        // Web-optimized MP4 container
        .arg("-movflags").arg("+faststart") // Move moov atom to beginning for web streaming
        .arg("-video_track_timescale").arg("90000"); // Standard MPEG timescale

    // Add audio encoding based on audio settings
    let audio_settings = options.audio_settings.as_ref();
    let mic_enabled = audio_settings.map(|s| s.microphone_enabled).unwrap_or(true);

    // Only enable system audio if enabled AND a valid device is selected
    let sys_audio_enabled = audio_settings
        .map(|s| {
            s.system_audio_enabled
            && !s.system_audio_device.is_empty()
            && s.system_audio_device != "none"
        })
        .unwrap_or(false);

    let has_audio = mic_enabled || sys_audio_enabled;

    if has_audio {
        let audio_quality = audio_settings
            .map(|s| s.audio_quality.as_str())
            .unwrap_or("standard");

        // Set bitrate based on quality
        let bitrate = match audio_quality {
            "voice" => "64k",
            "standard" => "128k",
            "high" => "256k",
            _ => "128k",
        };

        // Check if we're mixing dual audio (mic + system)
        // This happens when we have 3 inputs: video (0), mic (1), system (2)
        // ONLY add filter if BOTH are enabled and we actually created 3 inputs
        #[cfg(target_os = "macos")]
        if options.mode == "screen" && mic_enabled && sys_audio_enabled {
            // Dual audio mixing: merge mic (input 1) + system (input 2)
            // Use amerge filter to combine both audio streams
            cmd.arg("-filter_complex")
                .arg("[1:a][2:a]amerge=inputs=2[aout]")
                .arg("-map").arg("0:v")  // Video from input 0 (screen)
                .arg("-map").arg("[aout]"); // Mixed audio output
        }

        cmd.arg("-c:a").arg("aac")
            .arg("-b:a").arg(bitrate)
            .arg("-ar").arg("48000");
    }

    cmd.arg("-y")
        .arg(&options.output_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped()); // Capture stderr to see errors

    log::info!("Starting FFmpeg process: {:?}", cmd);

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to start FFmpeg recording: {}. Make sure FFmpeg is installed.", e)
    })?;

    // Give FFmpeg a moment to start and validate inputs
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Check if the process is still running (didn't immediately fail)
    match child.try_wait() {
        Ok(Some(status)) => {
            // Process already exited - this is an error
            let stderr = child.stderr.take();
            if let Some(mut stderr) = stderr {
                use std::io::Read;
                let mut error_msg = String::new();
                let _ = stderr.read_to_string(&mut error_msg);
                log::error!("FFmpeg failed immediately: {}", error_msg);
                return Err(format!("FFmpeg failed to start recording. Error: {}", error_msg));
            }
            return Err(format!("FFmpeg exited immediately with status: {}", status));
        }
        Ok(None) => {
            // Process is still running - good!
            log::info!("FFmpeg process started successfully");
        }
        Err(e) => {
            log::warn!("Could not check FFmpeg status: {}", e);
        }
    }

    *recording_process = Some(child);
    Ok("Recording started".to_string())
}

#[tauri::command]
fn stop_recording(state: State<RecordingState>) -> Result<String, String> {
    log::info!("Stopping recording");

    let mut recording_process = state.process.lock().unwrap();

    if let Some(mut child) = recording_process.take() {
        // Send SIGINT to FFmpeg to gracefully stop
        #[cfg(unix)]
        {
            unsafe {
                libc::kill(child.id() as i32, libc::SIGINT);
            }
        }

        #[cfg(not(unix))]
        {
            let _ = child.kill();
        }

        // Wait for process to finish
        match child.wait() {
            Ok(status) => {
                log::info!("Recording stopped with status: {:?}", status);

                // FFmpeg exits with 255 when stopped via SIGINT - this is NORMAL and expected
                // Only check for errors if the exit code indicates a real failure
                #[cfg(unix)]
                let is_normal_exit = {
                    use std::os::unix::process::ExitStatusExt;
                    status.code() == Some(255) || status.signal() == Some(2) || status.success()
                };

                #[cfg(not(unix))]
                let is_normal_exit = status.success();

                if !is_normal_exit {
                    if let Some(mut stderr) = child.stderr.take() {
                        use std::io::Read;
                        let mut error_msg = String::new();
                        if stderr.read_to_string(&mut error_msg).is_ok() {
                            log::error!("FFmpeg stderr: {}", error_msg);

                            // Check for common permission errors
                            if error_msg.contains("not permitted") || error_msg.contains("Operation not permitted") {
                                return Err("Recording failed: Screen recording permission denied. Please grant permission in System Settings > Privacy & Security > Screen Recording".to_string());
                            }
                            if error_msg.contains("Invalid device") {
                                return Err("Recording failed: Invalid audio device selected".to_string());
                            }
                            if error_msg.contains("Error") && !error_msg.contains("Exiting normally") {
                                return Err(format!("Recording failed: {}", error_msg.lines().find(|l| l.contains("Error")).unwrap_or("Unknown error")));
                            }
                        }
                    }
                    return Err(format!("Recording failed with status: {}. Check the logs for details.", status));
                }

                // Give FFmpeg a moment to flush and close the file
                std::thread::sleep(std::time::Duration::from_millis(500));

                log::info!("Recording completed successfully");
                Ok("Recording stopped".to_string())
            }
            Err(e) => {
                log::error!("Error waiting for FFmpeg process: {}", e);
                Err(format!("Failed to stop recording cleanly: {}", e))
            }
        }
    } else {
        Err("No active recording".to_string())
    }
}

#[tauri::command]
fn open_in_native_player(path: String) -> Result<(), String> {
    log::info!("Opening video in native player: {}", path);

    #[cfg(target_os = "macos")]
    {
        // Use macOS 'open' command to open in QuickTime or default player
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open video: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open video: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open video: {}", e))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(RecordingState {
      process: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![
      import_video,
      export_video,
      export_multi_clip,
      start_recording,
      stop_recording,
      open_in_native_player,
      list_audio_devices
      // Native player commands removed - using video.js frontend player instead
    ])
    .register_uri_scheme_protocol("video", |_app, request| {
      use tauri::http::{Response, StatusCode};
      use std::io::{Seek, SeekFrom, Read};

      // Custom protocol handler for serving video files with proper HTTP Range support
      // This is critical for video streaming performance

      let uri = request.uri().to_string();
      // log::info!("Video protocol request: {}", uri); // Disabled for performance

      // Extract the file path from the URI (format: video://localhost/<path>)
      let path = uri
        .strip_prefix("video://localhost")
        .unwrap_or(&uri);

      // log::info!("Attempting to serve video file: {}", path); // Disabled for performance

      // Open the file
      let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => {
          log::error!("Failed to open video file: {}", e);
          return Response::builder()
            .header("Access-Control-Allow-Origin", "*")
            .status(StatusCode::NOT_FOUND)
            .body(format!("Video not found: {}", e).into_bytes())
            .unwrap();
        }
      };

      // Get file size
      let file_size = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(e) => {
          log::error!("Failed to get file metadata: {}", e);
          return Response::builder()
            .header("Access-Control-Allow-Origin", "*")
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(format!("Failed to read file metadata: {}", e).into_bytes())
            .unwrap();
        }
      };

      // Check for Range header to support partial content requests
      let range_header = request.headers().get("Range")
        .and_then(|v| v.to_str().ok());

      if let Some(range_str) = range_header {
        // Parse range header (format: "bytes=start-end")
        // log::info!("Range request: {}", range_str); // Disabled for performance

        if let Some(range_values) = range_str.strip_prefix("bytes=") {
          let parts: Vec<&str> = range_values.split('-').collect();
          if parts.len() == 2 {
            let start: u64 = parts[0].parse().unwrap_or(0);
            let end: u64 = if parts[1].is_empty() {
              file_size.saturating_sub(1)
            } else {
              parts[1].parse().unwrap_or(file_size.saturating_sub(1)).min(file_size.saturating_sub(1))
            };

            let content_length = end - start + 1;

            // log::info!("Serving range: {}-{}/{} ({} bytes)", start, end, file_size, content_length); // Disabled for performance

            // Seek to start position
            if let Err(e) = file.seek(SeekFrom::Start(start)) {
              log::error!("Failed to seek: {}", e);
              return Response::builder()
                .header("Access-Control-Allow-Origin", "*")
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(vec![])
                .unwrap();
            }

            // Read the requested range
            let mut buffer = vec![0u8; content_length as usize];
            if let Err(e) = file.read_exact(&mut buffer) {
              log::error!("Failed to read range: {}", e);
              return Response::builder()
                .header("Access-Control-Allow-Origin", "*")
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(vec![])
                .unwrap();
            }

            // Return 206 Partial Content
            return Response::builder()
              .header("Content-Type", "video/mp4")
              .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size))
              .header("Content-Length", content_length.to_string())
              .header("Accept-Ranges", "bytes")
              .header("Access-Control-Allow-Origin", "*")
              .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
              .header("Access-Control-Allow-Headers", "*")
              .status(StatusCode::PARTIAL_CONTENT)
              .body(buffer)
              .unwrap();
          }
        }
      }

      // No range request - serve entire file
      log::info!("Serving entire file: {} bytes", file_size);

      match std::fs::read(path) {
        Ok(data) => {
          Response::builder()
            .header("Content-Type", "video/mp4")
            .header("Content-Length", file_size.to_string())
            .header("Accept-Ranges", "bytes")
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "*")
            .status(StatusCode::OK)
            .body(data)
            .unwrap()
        }
        Err(e) => {
          log::error!("Failed to read entire file: {}", e);
          Response::builder()
            .header("Access-Control-Allow-Origin", "*")
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(format!("Failed to read file: {}", e).into_bytes())
            .unwrap()
        }
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
