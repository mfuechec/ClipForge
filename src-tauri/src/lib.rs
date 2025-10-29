use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Child, Stdio};
use std::fs::File;
use std::io::Write;
use std::sync::Mutex;
use tauri::{Emitter, State};

// Native video player module removed - using video.js in frontend instead
// mod video_player;

// Helper function to find FFmpeg executable in common locations
fn find_ffmpeg() -> String {
    // Try common installation paths for macOS
    let paths = vec![
        "ffmpeg",                           // In PATH
        "/opt/homebrew/bin/ffmpeg",         // Apple Silicon Homebrew
        "/usr/local/bin/ffmpeg",            // Intel Homebrew
    ];

    for path in paths {
        if Command::new(path).arg("-version").output().is_ok() {
            log::info!("Found FFmpeg at: {}", path);
            return path.to_string();
        }
    }

    log::warn!("FFmpeg not found in common locations, falling back to 'ffmpeg'");
    "ffmpeg".to_string()
}

// Helper function to find FFprobe executable in common locations
fn find_ffprobe() -> String {
    // Try common installation paths for macOS
    let paths = vec![
        "ffprobe",                          // In PATH
        "/opt/homebrew/bin/ffprobe",        // Apple Silicon Homebrew
        "/usr/local/bin/ffprobe",           // Intel Homebrew
    ];

    for path in paths {
        if Command::new(path).arg("-version").output().is_ok() {
            log::info!("Found FFprobe at: {}", path);
            return path.to_string();
        }
    }

    log::warn!("FFprobe not found in common locations, falling back to 'ffprobe'");
    "ffprobe".to_string()
}

// Helper function to round floating point values to 3 decimal places (milliseconds)
// This avoids FFmpeg precision issues with timing values
fn round_to_millis(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

// Helper function to find ScreenRecorder Swift helper
#[cfg(target_os = "macos")]
fn find_screen_recorder() -> PathBuf {
    // The binary is compiled to src-tauri/swift-helper/ScreenRecorder during build
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    PathBuf::from(manifest_dir).join("swift-helper").join("ScreenRecorder")
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoMetadata {
    path: String,
    filename: String,
    duration: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    thumbnail_path: Option<String>,
}

#[tauri::command]
fn import_video(path: String) -> Result<VideoMetadata, String> {
    log::info!("import_video called with path: {}", path);

    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        log::error!("File does not exist: {}", path);
        return Err("File does not exist".to_string());
    }

    let filename = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    log::info!("Probing video metadata for: {}", filename);

    // Use FFmpeg to probe video metadata
    let (duration, width, height) = match probe_video_metadata(&path) {
        Ok(metadata) => {
            log::info!("Successfully probed metadata - Duration: {}s, Resolution: {}x{}",
                      metadata.0, metadata.1, metadata.2);
            metadata
        },
        Err(e) => {
            log::error!("Failed to probe video metadata: {}", e);
            return Err(e);
        }
    };

    // Generate thumbnail (non-fatal if it fails)
    let thumbnail_path = match generate_thumbnail(&path, duration) {
        Ok(thumb_path) => {
            log::info!("Thumbnail generated: {}", thumb_path);
            Some(thumb_path)
        },
        Err(e) => {
            log::warn!("Failed to generate thumbnail: {}", e);
            None
        }
    };

    let result = VideoMetadata {
        path: path.clone(),
        filename,
        duration: Some(duration),
        width: Some(width),
        height: Some(height),
        thumbnail_path,
    };

    log::info!("Returning metadata: {:?}", result);
    Ok(result)
}

// Helper function to probe video metadata using ffprobe
fn probe_video_metadata(path: &str) -> Result<(f64, u32, u32), String> {
    log::info!("Running ffprobe on: {}", path);

    let ffprobe = find_ffprobe();
    let output = Command::new(&ffprobe)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path
        ])
        .output()
        .map_err(|e| {
            log::error!("Failed to execute ffprobe: {}", e);
            format!("Failed to run ffprobe. Make sure FFmpeg is installed. Error: {}", e)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("ffprobe command failed. stderr: {}", stderr);
        return Err(format!("ffprobe failed to read video metadata: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    log::debug!("ffprobe JSON output: {}", json_str);

    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| {
            log::error!("Failed to parse ffprobe JSON: {}", e);
            format!("Failed to parse ffprobe output: {}", e)
        })?;

    // Extract duration from format section
    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|s| {
            log::debug!("Parsing duration string: {}", s);
            s.parse::<f64>().ok()
        })
        .unwrap_or(0.0);

    log::info!("Extracted duration: {} seconds", duration);

    // Extract width and height from first video stream
    let streams = json["streams"].as_array()
        .ok_or_else(|| {
            log::error!("No streams array in ffprobe output");
            "No streams found in video".to_string()
        })?;

    log::info!("Found {} streams", streams.len());

    let video_stream = streams.iter()
        .find(|s| s["codec_type"] == "video")
        .ok_or_else(|| {
            log::error!("No video stream found in {} streams", streams.len());
            "No video stream found".to_string()
        })?;

    let width = video_stream["width"].as_u64().unwrap_or(1920) as u32;
    let height = video_stream["height"].as_u64().unwrap_or(1080) as u32;

    log::info!("Extracted resolution: {}x{}", width, height);

    Ok((duration, width, height))
}

// Helper function to generate thumbnail for a video
fn generate_thumbnail(video_path: &str, duration: f64) -> Result<String, String> {
    log::info!("Generating thumbnail for: {}", video_path);

    // Create thumbnails directory in temp folder
    let temp_dir = std::env::temp_dir();
    let thumbnails_dir = temp_dir.join("clipforge_thumbnails");

    // Create directory if it doesn't exist
    std::fs::create_dir_all(&thumbnails_dir)
        .map_err(|e| format!("Failed to create thumbnails directory: {}", e))?;

    // Generate thumbnail filename based on video path hash
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    video_path.hash(&mut hasher);
    let hash = hasher.finish();
    let thumbnail_filename = format!("thumb_{}.jpg", hash);
    let thumbnail_path = thumbnails_dir.join(thumbnail_filename);

    // Extract frame at 2 seconds or 10% of duration (whichever is smaller)
    let timestamp = (duration * 0.1).min(2.0);

    log::info!("Extracting frame at {}s to: {:?}", timestamp, thumbnail_path);

    // Use FFmpeg to extract a single frame
    let ffmpeg = find_ffmpeg();
    let output = Command::new(&ffmpeg)
        .args(&[
            "-ss", &timestamp.to_string(),  // Seek to timestamp
            "-i", video_path,                // Input video
            "-vframes", "1",                 // Extract 1 frame
            "-vf", "scale=320:-1",          // Scale to width 320, maintain aspect ratio
            "-q:v", "2",                     // High quality JPEG
            "-y",                            // Overwrite if exists
            thumbnail_path.to_str().unwrap()
        ])
        .output()
        .map_err(|e| {
            log::error!("Failed to execute ffmpeg for thumbnail: {}", e);
            format!("Failed to generate thumbnail: {}", e)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("FFmpeg thumbnail generation failed: {}", stderr);
        return Err(format!("Failed to generate thumbnail: {}", stderr));
    }

    let thumbnail_path_str = thumbnail_path.to_string_lossy().to_string();
    log::info!("Thumbnail generated successfully: {}", thumbnail_path_str);

    Ok(thumbnail_path_str)
}

// Generate waveform data for audio visualization
#[tauri::command]
fn generate_waveform(video_path: String, samples: Option<usize>) -> Result<Vec<f32>, String> {
    let num_samples = samples.unwrap_or(200);
    log::info!("Generating waveform for: {} with {} samples", video_path, num_samples);

    // First, check if the video has an audio stream
    let ffprobe = find_ffprobe();
    let probe_output = Command::new(&ffprobe)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-select_streams", "a",  // Only select audio streams
            &video_path
        ])
        .output()
        .map_err(|e| format!("Failed to probe video: {}", e))?;

    let json_str = String::from_utf8_lossy(&probe_output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    // Check if there are any audio streams
    let audio_streams = json["streams"].as_array()
        .map(|arr| arr.len())
        .unwrap_or(0);

    if audio_streams == 0 {
        log::info!("No audio stream found in video, returning silent waveform");
        // Return silent waveform (all zeros)
        return Ok(vec![0.0; num_samples]);
    }

    // Get the duration of the video
    let probe_output = Command::new(&ffprobe)
        .arg("-v").arg("error")
        .arg("-show_entries").arg("format=duration")
        .arg("-of").arg("default=noprint_wrappers=1:nokey=1")
        .arg(&video_path)
        .output()
        .map_err(|e| format!("Failed to probe video: {}", e))?;

    let duration_str = String::from_utf8_lossy(&probe_output.stdout);
    let duration: f64 = duration_str.trim().parse().unwrap_or(0.0);

    if duration <= 0.0 {
        return Err("Could not determine video duration".to_string());
    }

    // Use FFmpeg to extract audio peaks at regular intervals
    // We'll use the volumedetect filter to get volume levels
    let ffmpeg = find_ffmpeg();

    // Extract audio as raw PCM and get volume stats
    let temp_audio = std::env::temp_dir().join(format!("waveform_{}.raw", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));

    let output = Command::new(&ffmpeg)
        .arg("-i").arg(&video_path)
        .arg("-vn") // No video
        .arg("-acodec").arg("pcm_s16le") // PCM 16-bit
        .arg("-ar").arg("8000") // 8kHz sample rate (enough for visualization)
        .arg("-ac").arg("1") // Mono
        .arg("-f").arg("s16le") // Raw PCM output
        .arg("-y")
        .arg(&temp_audio)
        .output()
        .map_err(|e| format!("Failed to extract audio: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("FFmpeg audio extraction failed: {}", stderr);
        return Err(format!("Failed to extract audio: {}", stderr));
    }

    // Read the raw PCM data
    let audio_data = std::fs::read(&temp_audio).map_err(|e| format!("Failed to read audio data: {}", e))?;
    let _ = std::fs::remove_file(&temp_audio); // Clean up

    // Convert bytes to i16 samples
    let mut samples_i16: Vec<i16> = Vec::new();
    for chunk in audio_data.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
        samples_i16.push(sample);
    }

    if samples_i16.is_empty() {
        // Silent audio or no audio track
        return Ok(vec![0.0; num_samples]);
    }

    // Downsample to the requested number of samples by taking RMS of chunks
    let chunk_size = samples_i16.len() / num_samples;
    let mut waveform: Vec<f32> = Vec::new();

    for i in 0..num_samples {
        let start = i * chunk_size;
        let end = ((i + 1) * chunk_size).min(samples_i16.len());

        if start >= samples_i16.len() {
            waveform.push(0.0);
            continue;
        }

        // Calculate RMS (root mean square) for this chunk
        let chunk = &samples_i16[start..end];
        let sum_squares: f64 = chunk.iter().map(|&s| (s as f64).powi(2)).sum();
        let rms = (sum_squares / chunk.len() as f64).sqrt();

        // Normalize to 0.0-1.0 range (i16 max is 32767)
        let normalized = (rms / 32767.0) as f32;
        waveform.push(normalized);
    }

    log::info!("Waveform generated with {} data points", waveform.len());
    Ok(waveform)
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

    // Check if input has an audio stream
    let ffprobe = find_ffprobe();
    let probe_output = Command::new(&ffprobe)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-select_streams", "a",
            &options.input_path
        ])
        .output()
        .map_err(|e| format!("Failed to probe input: {}", e))?;

    let json_str = String::from_utf8_lossy(&probe_output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .unwrap_or(serde_json::json!({"streams": []}));

    let has_audio = json["streams"].as_array()
        .map(|arr| !arr.is_empty())
        .unwrap_or(false);

    // Build FFmpeg command
    let ffmpeg = find_ffmpeg();
    let mut cmd = Command::new(&ffmpeg);
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
        .arg("-crf").arg("23");

    if has_audio {
        cmd.arg("-c:a").arg("aac")
            .arg("-b:a").arg("128k");
    }

    cmd.arg("-y") // Overwrite output file
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
    audio_trim_start: Option<f64>,
    audio_trim_end: Option<f64>,
    is_video_muted: Option<bool>,
    is_audio_muted: Option<bool>,
    is_audio_linked: Option<bool>,
    audio_offset: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MultiClipExportOptions {
    clips: Vec<ClipSegment>,
    output_path: String,
}

#[derive(Clone, serde::Serialize)]
struct MergeProgress {
    current: usize,
    total: usize,
    status: String,
}

#[tauri::command]
fn export_multi_clip(options: MultiClipExportOptions, window: tauri::Window) -> Result<String, String> {
    log::info!("Starting multi-clip export with {} clips", options.clips.len());

    if options.clips.is_empty() {
        return Err("No clips to export".to_string());
    }

    // Emit initial progress
    let _ = window.emit("merge-progress", MergeProgress {
        current: 0,
        total: options.clips.len(),
        status: "Starting merge...".to_string(),
    });

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

    // Step 1: Export each clip with trim applied and handle audio/video separation
    for (i, clip) in options.clips.iter().enumerate() {
        // Emit progress for current clip
        let _ = window.emit("merge-progress", MergeProgress {
            current: i + 1,
            total: options.clips.len(),
            status: format!("Processing clip {} of {}...", i + 1, options.clips.len()),
        });

        let temp_path = temp_dir.join(format!("clipforge_temp_{}.mp4", i));

        log::info!("Exporting clip {} to temp file: {:?}", i, temp_path);

        // Round trim values to 3 decimal places to avoid ffmpeg precision issues
        let trim_start = clip.trim_start.map(round_to_millis);
        let trim_end = clip.trim_end.map(round_to_millis);
        let audio_trim_start = clip.audio_trim_start.or(trim_start).map(round_to_millis);
        let audio_trim_end = clip.audio_trim_end.or(trim_end).map(round_to_millis);

        // Check if input has an audio stream
        let ffprobe = find_ffprobe();
        let probe_output = Command::new(&ffprobe)
            .args(&[
                "-v", "quiet",
                "-print_format", "json",
                "-show_streams",
                "-select_streams", "a",
                &clip.input_path
            ])
            .output()
            .map_err(|e| format!("Failed to probe clip {}: {}", i, e))?;

        let json_str = String::from_utf8_lossy(&probe_output.stdout);
        let json: serde_json::Value = serde_json::from_str(&json_str)
            .unwrap_or(serde_json::json!({"streams": []}));

        let has_audio = json["streams"].as_array()
            .map(|arr| !arr.is_empty())
            .unwrap_or(false);

        log::info!("Clip {} has audio: {}", i, has_audio);

        let ffmpeg = find_ffmpeg();
        let mut cmd = Command::new(&ffmpeg);
        cmd.arg("-i").arg(&clip.input_path);

        let is_video_muted = clip.is_video_muted.unwrap_or(false);
        let is_audio_muted = clip.is_audio_muted.unwrap_or(false);
        let is_audio_linked = clip.is_audio_linked.unwrap_or(true);
        let audio_offset = clip.audio_offset.unwrap_or(0.0);

        // Check if audio trim is different from video trim
        let has_independent_audio_trim = audio_trim_start != trim_start || audio_trim_end != trim_end;

        // Add trim parameters for video (if audio trim is independent, we'll handle it with filters)
        if !has_independent_audio_trim {
            // Audio and video trim are the same, apply trim to entire file
            if let (Some(start), Some(end)) = (trim_start, trim_end) {
                let raw_duration = end - start;
                // Round duration to avoid floating point precision issues
                let duration = round_to_millis(raw_duration);
                cmd.arg("-ss").arg(start.to_string());
                cmd.arg("-t").arg(duration.to_string());
            }
        }

        // Calculate clip duration for generating placeholders (already rounded from trim values)
        let duration = if let (Some(start), Some(end)) = (trim_start, trim_end) {
            let raw_duration = end - start;
            // Round duration to avoid floating point precision issues
            let rounded = round_to_millis(raw_duration);
            log::info!("Clip {} duration: raw={}, start={}, end={}, rounded={}", i, raw_duration, start, end, rounded);
            rounded
        } else {
            // Use ffprobe to get duration if not trimmed
            let ffprobe = find_ffprobe();
            let probe_output = Command::new(&ffprobe)
                .arg("-v").arg("error")
                .arg("-show_entries").arg("format=duration")
                .arg("-of").arg("default=noprint_wrappers=1:nokey=1")
                .arg(&clip.input_path)
                .output()
                .map_err(|e| format!("Failed to probe clip {}: {}", i, e))?;

            let parsed_duration = String::from_utf8_lossy(&probe_output.stdout)
                .trim()
                .parse::<f64>()
                .unwrap_or(0.0);
            let rounded = round_to_millis(parsed_duration);
            log::info!("Clip {} duration from ffprobe: raw={}, rounded={}", i, parsed_duration, rounded);
            rounded
        };

        // Build filter complex for handling muted tracks, audio offset, and independent audio trim
        let mut filter_parts = Vec::new();
        let mut needs_filter = has_independent_audio_trim;

        // Handle video
        let video_filter = if is_video_muted {
            needs_filter = true;
            let duration_str = format!("{:.3}", duration);
            format!("color=c=black:s=1920x1080:d={},fps=30[v]", duration_str)
        } else if has_independent_audio_trim {
            // Apply video trim using filter
            needs_filter = true;
            if let (Some(start), Some(end)) = (trim_start, trim_end) {
                format!("[0:v]trim=start={}:end={},setpts=PTS-STARTPTS[v]", start, end)
            } else {
                "[0:v]null[v]".to_string()
            }
        } else {
            "[0:v]null[v]".to_string()
        };
        filter_parts.push(video_filter);

        // Handle audio
        let audio_filter = if !has_audio || is_audio_muted {
            // No audio stream or audio is muted - generate silent audio
            needs_filter = true;
            let duration_str = format!("{:.3}", duration);
            log::info!("Clip {} generating silent audio with duration: {} (formatted as {})", i, duration, duration_str);
            format!("anullsrc=channel_layout=stereo:sample_rate=44100:duration={}[a]", duration_str)
        } else if has_independent_audio_trim {
            // Apply audio-specific trim
            needs_filter = true;
            if let (Some(start), Some(end)) = (audio_trim_start, audio_trim_end) {
                let mut audio_chain = format!("[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS", start, end);

                // Add audio offset if needed
                if !is_audio_linked && audio_offset != 0.0 {
                    let delay_ms = (audio_offset * 1000.0).round() as i64;
                    if delay_ms > 0 {
                        audio_chain.push_str(&format!(",adelay={}|{}", delay_ms, delay_ms));
                    }
                }

                audio_chain.push_str("[a]");
                audio_chain
            } else {
                // If no trim specified, still use audio but ensure we're using filter mode
                needs_filter = true;
                "[0:a]anull[a]".to_string()
            }
        } else if !is_audio_linked && audio_offset != 0.0 {
            needs_filter = true;
            let delay_ms = (audio_offset * 1000.0).round() as i64;
            if delay_ms > 0 {
                format!("[0:a]adelay={}|{}[a]", delay_ms, delay_ms)
            } else if delay_ms < 0 {
                format!("[0:a]atrim=start={}[a]", -audio_offset)
            } else {
                "[0:a]anull[a]".to_string()
            }
        } else if has_audio {
            // Has audio but no special processing - use pass-through filter for consistency
            needs_filter = true;
            "[0:a]anull[a]".to_string()
        } else {
            // Fallback: generate silent audio
            needs_filter = true;
            format!("anullsrc=channel_layout=stereo:sample_rate=44100:duration={}[a]", duration)
        };
        filter_parts.push(audio_filter);

        // Add filter_complex and map outputs
        if needs_filter || is_video_muted || is_audio_muted || (!is_audio_linked && audio_offset != 0.0) || !has_audio {
            let filter_str = filter_parts.join(";");
            cmd.arg("-filter_complex").arg(&filter_str);
            cmd.arg("-map").arg("[v]");
            cmd.arg("-map").arg("[a]");
        } else {
            // No special processing needed, use default mapping
            cmd.arg("-map").arg("0:v");
            if has_audio {
                cmd.arg("-map").arg("0:a");
            }
        }

        // Output options - re-encode to ensure compatibility
        // Use ultrafast preset for temp files to speed up processing
        cmd.arg("-c:v").arg("libx264")
            .arg("-preset").arg("ultrafast")
            .arg("-crf").arg("23")
            .arg("-c:a").arg("aac")
            .arg("-b:a").arg("128k")
            .arg("-y")
            .arg(&temp_path);

        log::info!("FFmpeg command: {:?}", cmd);

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

            // Parse error and provide user-friendly message
            let error_msg = if stderr.contains("Could not open encoder before EOF") || stderr.contains("Invalid argument") {
                format!("Failed to process clip {} due to audio/video sync issues. This can happen with very short clips or corrupted files. Try adjusting the clip boundaries slightly.", i + 1)
            } else if stderr.contains("No such file or directory") {
                format!("Clip {} file not found. The source video may have been moved or deleted.", i + 1)
            } else if stderr.contains("Invalid data found") {
                format!("Clip {} appears to be corrupted or in an unsupported format.", i + 1)
            } else if stderr.contains("Permission denied") {
                format!("Permission denied while processing clip {}. Check file permissions.", i + 1)
            } else {
                // Extract just the key error lines instead of dumping everything
                let key_errors: Vec<&str> = stderr.lines()
                    .filter(|line| line.contains("Error") || line.contains("failed") || line.contains("Invalid"))
                    .take(3)  // Only show first 3 error lines
                    .collect();

                if !key_errors.is_empty() {
                    format!("Failed to process clip {}: {}", i + 1, key_errors.join("; "))
                } else {
                    format!("Failed to process clip {}. Check the logs for details.", i + 1)
                }
            };

            return Err(error_msg);
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

    // Emit progress for concatenation step
    let _ = window.emit("merge-progress", MergeProgress {
        current: options.clips.len(),
        total: options.clips.len(),
        status: "Merging clips together...".to_string(),
    });

    // Step 3: Concat all clips
    let ffmpeg = find_ffmpeg();
    let mut concat_cmd = Command::new(&ffmpeg);
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

#[derive(Debug, Serialize, Deserialize)]
pub struct TestSettings {
    use_wallclock_as_timestamps: bool,
    audio_filter: String,
    rtbufsize: String,
    thread_queue_size: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StartTestRecordingOptions {
    mode: String,
    output_path: String,
    audio_settings: Option<AudioSettings>,
    test_settings: TestSettings,
}

#[tauri::command]
fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    log::info!("Listing audio devices");

    #[cfg(target_os = "macos")]
    {
        // Use FFmpeg to list AVFoundation devices
        let ffmpeg = find_ffmpeg();
        let output = Command::new(&ffmpeg)
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
    let ffmpeg = find_ffmpeg();
    let mut cmd = Command::new(&ffmpeg);

    // Add global sync and buffer parameters for all platforms
    // These ensure audio/video stay synchronized during capture
    cmd.arg("-loglevel").arg("verbose")  // Verbose logging for diagnostics
        .arg("-rtbufsize").arg("200M");  // Larger realtime buffer to prevent audio drops

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
                    .arg("-framerate").arg("15")
                    // Use wallclock timestamps for consistent timing across inputs
                    .arg("-use_wallclock_as_timestamps").arg("1");

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
                    cmd.arg("-probesize").arg("100M")  // Large probe buffer for stable detection
                        .arg("-rtbufsize").arg("200M")  // Large realtime buffer to prevent drops
                        .arg("-f").arg("avfoundation")
                        // Use device timestamps for audio (not wallclock - prevents choppiness)
                        .arg("-thread_queue_size").arg("8192")  // Very large queue for smooth audio
                        .arg("-i").arg(&format!(":{}", mic_device));

                    // System audio input (BlackHole or similar)
                    cmd.arg("-probesize").arg("100M")  // Large probe buffer for stable detection
                        .arg("-rtbufsize").arg("200M")  // Large realtime buffer to prevent drops
                        .arg("-f").arg("avfoundation")
                        // Use device timestamps for audio (not wallclock - prevents choppiness)
                        .arg("-thread_queue_size").arg("8192")  // Very large queue for smooth audio
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
                // For webcam, capture video device 0 with audio
                if mic_enabled {
                    // Capture webcam with microphone audio
                    cmd.arg("-f").arg("avfoundation")
                        .arg("-framerate").arg("30")
                        // Use wallclock timestamps for consistent timing
                        .arg("-use_wallclock_as_timestamps").arg("1")
                        .arg("-i").arg(&format!("0:{}", mic_device));

                    // Explicitly map video and audio streams
                    cmd.arg("-map").arg("0:v")  // Video from webcam
                        .arg("-map").arg("0:a"); // Audio from microphone
                } else {
                    // Capture webcam without audio
                    cmd.arg("-f").arg("avfoundation")
                        .arg("-framerate").arg("30")
                        // Use wallclock timestamps for consistent timing
                        .arg("-use_wallclock_as_timestamps").arg("1")
                        .arg("-i").arg("0:none");
                }
            },
            "combo" => {
                // For combo mode: capture screen + webcam, then overlay webcam on screen

                // Input 0: Screen video (no audio attached to avoid conflicts)
                // Increased thread_queue_size for better buffering and sync (was 512)
                cmd.arg("-thread_queue_size").arg("2048")
                    .arg("-f").arg("avfoundation")
                    .arg("-capture_cursor").arg("1")
                    .arg("-framerate").arg("30")
                    // Use wallclock timestamps for consistent timing across all inputs
                    .arg("-use_wallclock_as_timestamps").arg("1")
                    .arg("-i").arg("1:none");

                // Input 1: Webcam video (no audio, we'll handle audio separately)
                // Increased thread_queue_size for smooth capture
                cmd.arg("-thread_queue_size").arg("2048")
                    .arg("-f").arg("avfoundation")
                    .arg("-framerate").arg("30")
                    // Use wallclock timestamps for consistent timing
                    .arg("-use_wallclock_as_timestamps").arg("1")
                    .arg("-i").arg("0:none");

                // Handle audio inputs separately (similar to screen mode dual audio)
                if mic_enabled && sys_audio_enabled {
                    let sys_audio_device = audio_settings
                        .and_then(|s| {
                            if s.system_audio_device == "none" || s.system_audio_device.is_empty() {
                                None
                            } else {
                                Some(s.system_audio_device.as_str())
                            }
                        })
                        .unwrap_or("1");

                    // Input 2: Microphone audio
                    cmd.arg("-probesize").arg("100M")  // Large probe buffer for stable detection
                        .arg("-rtbufsize").arg("200M")  // Large realtime buffer to prevent drops
                        .arg("-thread_queue_size").arg("8192")
                        .arg("-f").arg("avfoundation")
                        // Use device timestamps for audio (not wallclock - prevents choppiness)
                        .arg("-i").arg(&format!(":{}", mic_device));

                    // Input 3: System audio
                    cmd.arg("-probesize").arg("100M")  // Large probe buffer for stable detection
                        .arg("-rtbufsize").arg("200M")  // Large realtime buffer to prevent drops
                        .arg("-thread_queue_size").arg("8192")
                        .arg("-f").arg("avfoundation")
                        // Use device timestamps for audio (not wallclock - prevents choppiness)
                        .arg("-i").arg(&format!(":{}", sys_audio_device));
                } else if mic_enabled {
                    // Input 2: Just microphone
                    cmd.arg("-probesize").arg("100M")  // Large probe buffer for stable detection
                        .arg("-rtbufsize").arg("200M")  // Large realtime buffer to prevent drops
                        .arg("-thread_queue_size").arg("8192")
                        .arg("-f").arg("avfoundation")
                        // Use device timestamps for audio (not wallclock - prevents choppiness)
                        .arg("-i").arg(&format!(":{}", mic_device));
                } else if sys_audio_enabled {
                    // Input 2: Just system audio
                    let sys_audio_device = audio_settings
                        .and_then(|s| {
                            if s.system_audio_device == "none" || s.system_audio_device.is_empty() {
                                None
                            } else {
                                Some(s.system_audio_device.as_str())
                            }
                        })
                        .unwrap_or("1");
                    cmd.arg("-probesize").arg("100M")  // Large probe buffer for stable detection
                        .arg("-rtbufsize").arg("200M")  // Large realtime buffer to prevent drops
                        .arg("-thread_queue_size").arg("8192")
                        .arg("-f").arg("avfoundation")
                        // Use device timestamps for audio (not wallclock - prevents choppiness)
                        .arg("-i").arg(&format!(":{}", sys_audio_device));
                }
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

    // Video filtering depends on mode:
    // - For screen/webcam: simple scale filter
    // - For combo: overlay webcam on screen (picture-in-picture)
    #[cfg(target_os = "macos")]
    let is_combo_mode = options.mode == "combo";

    #[cfg(not(target_os = "macos"))]
    let is_combo_mode = false;

    if !is_combo_mode {
        // Simple scale for screen and webcam modes - 720p to reduce CPU load
        cmd.arg("-vf").arg("scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2");
    }

    #[cfg(target_os = "macos")]
    {
        // Use hardware encoding on macOS (VideoToolbox) - offloads video to GPU
        cmd.arg("-c:v").arg("h264_videotoolbox")
            .arg("-b:v").arg("5000k") // 5 Mbps bitrate for good quality
            .arg("-allow_sw").arg("1") // Fallback to software if hardware unavailable
            .arg("-require_sw").arg("0"); // Prefer hardware encoding
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Software encoding for non-macOS platforms
        cmd.arg("-c:v").arg("libx264")
            .arg("-preset").arg("ultrafast")
            .arg("-crf").arg("23");
    }

    cmd
        .arg("-pix_fmt").arg("yuv420p") // Standard pixel format
        // CRITICAL: Force constant frame rate at 15fps
        .arg("-r").arg("15")
        .arg("-vsync").arg("cfr")
        .arg("-g").arg("15") // GOP size = framerate for consistent keyframes
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

        // Set bitrate based on quality (increased for better audio quality and less crackling)
        let bitrate = match audio_quality {
            "voice" => "96k",     // Increased from 64k
            "standard" => "192k", // Increased from 128k (test 4 winner!)
            "high" => "256k",     // Unchanged
            _ => "192k",          // Default to standard
        };

        // Check if we're mixing dual audio (mic + system) or doing video overlay (combo mode)
        #[cfg(target_os = "macos")]
        if options.mode == "combo" {
            // Combo mode: overlay webcam on screen + handle audio
            // Inputs: 0=screen video, 1=webcam video, 2=mic audio (optional), 3=system audio (optional)

            // Create picture-in-picture effect: webcam in bottom-right corner
            // Use fps filter and setpts to ensure smooth, synchronized playback
            // Scale screen to 1280x720 (720p), scale webcam to 213x120, overlay at bottom-right with 20px margin
            let video_filter = "[0:v]fps=15,setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2[screen];\
                               [1:v]fps=15,setpts=PTS-STARTPTS,scale=213:120:force_original_aspect_ratio=decrease:force_divisible_by=2[webcam];\
                               [screen][webcam]overlay=W-w-20:H-h-20:shortest=1[vout]";

            if mic_enabled && sys_audio_enabled {
                // Both audio sources: mix them with simple timestamp normalization
                // Using asetpts instead of aresample to avoid resampling overhead
                let filter = format!("{};[2:a]asetpts=PTS-STARTPTS[a1];[3:a]asetpts=PTS-STARTPTS[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=2[aout]", video_filter);
                cmd.arg("-filter_complex").arg(&filter)
                    .arg("-map").arg("[vout]")    // Overlayed video
                    .arg("-map").arg("[aout]");   // Mixed audio
            } else if mic_enabled || sys_audio_enabled {
                // Single audio source - simple timestamp normalization
                let filter = format!("{};[2:a]asetpts=PTS-STARTPTS[aout]", video_filter);
                cmd.arg("-filter_complex").arg(&filter)
                    .arg("-map").arg("[vout]")    // Overlayed video
                    .arg("-map").arg("[aout]");   // Synced audio
            } else {
                // No audio
                cmd.arg("-filter_complex").arg(video_filter)
                    .arg("-map").arg("[vout]");   // Overlayed video only
            }
        } else if options.mode == "screen" && mic_enabled && sys_audio_enabled {
            // Screen mode with dual audio mixing: mix mic (input 1) + system (input 2)
            // Using asetpts instead of aresample to avoid resampling overhead
            cmd.arg("-filter_complex")
                .arg("[1:a]asetpts=PTS-STARTPTS[a1];[2:a]asetpts=PTS-STARTPTS[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=2[aout]")
                .arg("-map").arg("0:v")  // Video from input 0 (screen)
                .arg("-map").arg("[aout]"); // Mixed audio output
        }

        // Audio encoding settings (optimized for quality and reduced crackling)
        cmd.arg("-c:a").arg("aac")
            .arg("-b:a").arg(bitrate)
            .arg("-profile:a").arg("aac_low")  // AAC-LC profile for better quality
            .arg("-ar").arg("48000")
            .arg("-ac").arg("2"); // Stereo output

        // For simple captures (no filter_complex), add simple timestamp normalization
        // Using asetpts instead of aresample to avoid resampling overhead
        #[cfg(target_os = "macos")]
        if options.mode != "combo" && !(options.mode == "screen" && mic_enabled && sys_audio_enabled) {
            // Only add audio filter if we're not already using filter_complex
            cmd.arg("-af").arg("asetpts=PTS-STARTPTS");
        }
    }

    cmd.arg("-y")
        .arg(&options.output_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped()); // Capture stderr for diagnostics

    log::info!("Starting FFmpeg process: {:?}", cmd);

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to start FFmpeg recording: {}. Make sure FFmpeg is installed.", e)
    })?;

    // Capture stderr for continuous monitoring
    if let Some(stderr) = child.stderr.take() {
        // Spawn a thread to read and log FFmpeg output
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    // Log important messages
                    if line.contains("drop") || line.contains("discontinuity") ||
                       line.contains("buffer") || line.contains("queue") ||
                       line.contains("audio") || line.contains("overrun") ||
                       line.contains("underrun") || line.contains("pts") {
                        log::warn!("[FFmpeg Audio] {}", line);
                    }
                    // Also log at debug level for full capture
                    log::debug!("[FFmpeg] {}", line);
                }
            }
        });
    }

    // Give FFmpeg a moment to start and validate inputs
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Check if the process is still running (didn't immediately fail)
    match child.try_wait() {
        Ok(Some(status)) => {
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
fn start_test_recording(options: StartTestRecordingOptions, state: State<RecordingState>) -> Result<String, String> {
    log::info!("Starting test recording with custom settings: {:?}", options);

    let mut recording_process = state.process.lock().unwrap();
    if recording_process.is_some() {
        return Err("Recording already in progress".to_string());
    }

    // Build FFmpeg command with test settings
    let ffmpeg = find_ffmpeg();
    let mut cmd = Command::new(&ffmpeg);

    // Apply test settings for buffer and logging
    cmd.arg("-loglevel").arg("verbose")
        .arg("-rtbufsize").arg(&options.test_settings.rtbufsize);

    #[cfg(target_os = "macos")]
    {
        // Get audio settings
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

        // Screen capture with test settings
        if options.mode == "screen" {
            cmd.arg("-f").arg("avfoundation")
                .arg("-capture_cursor").arg("1")
                .arg("-framerate").arg("30");

            // Apply wallclock timestamp test setting
            if options.test_settings.use_wallclock_as_timestamps {
                cmd.arg("-use_wallclock_as_timestamps").arg("1");
            }

            // Input
            if mic_enabled {
                cmd.arg("-i").arg(&format!("1:{}", mic_device));
            } else {
                cmd.arg("-i").arg("1:none");
            }
        }

        // Thread queue size
        cmd.arg("-thread_queue_size").arg(options.test_settings.thread_queue_size.to_string());

        // Video encoding
        cmd.arg("-c:v").arg("libx264")
            .arg("-preset").arg("ultrafast")
            .arg("-pix_fmt").arg("yuv420p");

        // Audio encoding
        cmd.arg("-c:a").arg("aac")
            .arg("-b:a").arg("128k")
            .arg("-ar").arg("48000")
            .arg("-ac").arg("2");

        // Apply audio filter test setting if provided
        if !options.test_settings.audio_filter.is_empty() && mic_enabled {
            cmd.arg("-af").arg(&options.test_settings.audio_filter);
        }
    }

    cmd.arg("-y")
        .arg(&options.output_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    log::info!("Starting test recording FFmpeg process: {:?}", cmd);

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to start test recording: {}. Make sure FFmpeg is installed.", e)
    })?;

    // Capture stderr for monitoring
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if line.contains("drop") || line.contains("discontinuity") ||
                       line.contains("buffer") || line.contains("queue") ||
                       line.contains("audio") || line.contains("overrun") ||
                       line.contains("underrun") || line.contains("pts") {
                        log::warn!("[FFmpeg Test] {}", line);
                    }
                    log::debug!("[FFmpeg Test] {}", line);
                }
            }
        });
    }

    std::thread::sleep(std::time::Duration::from_millis(500));

    match child.try_wait() {
        Ok(Some(status)) => {
            return Err(format!("FFmpeg test recording exited immediately with status: {}", status));
        }
        Ok(None) => {
            log::info!("Test recording started successfully");
        }
        Err(e) => {
            log::warn!("Could not check FFmpeg test status: {}", e);
        }
    }

    *recording_process = Some(child);
    Ok(options.output_path)
}

// New ScreenCaptureKit-based recording (macOS only)
#[cfg(target_os = "macos")]
#[tauri::command]
fn start_screencapturekit_recording(
    output_path: String,
    duration: f64,
    audio_enabled: bool,
    state: State<RecordingState>
) -> Result<String, String> {
    log::info!("Starting ScreenCaptureKit recording: path={}, duration={}, audio={}",
               output_path, duration, audio_enabled);

    let mut recording_process = state.process.lock().unwrap();
    if recording_process.is_some() {
        return Err("Recording already in progress".to_string());
    }

    let screen_recorder = find_screen_recorder();
    if !screen_recorder.exists() {
        log::error!("ScreenRecorder binary not found at: {:?}", screen_recorder);
        return Err("ScreenRecorder binary not found. Please rebuild the application.".to_string());
    }

    log::info!("Using ScreenRecorder at: {:?}", screen_recorder);

    // Build command: ScreenRecorder <output_path> <display_id> <audio> <duration>
    let mut cmd = Command::new(&screen_recorder);
    cmd.arg(&output_path)
        .arg("0")  // Display 0 (main display)
        .arg(if audio_enabled { "true" } else { "false" })
        .arg(duration.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    log::info!("Starting ScreenRecorder process...");

    let mut child = cmd.spawn().map_err(|e| {
        log::error!("Failed to spawn ScreenRecorder: {}", e);
        format!("Failed to start ScreenRecorder: {}", e)
    })?;

    // Log output in background thread
    if let Some(stdout) = child.stdout.take() {
        use std::io::{BufRead, BufReader};
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                log::info!("[ScreenRecorder] {}", line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        use std::io::{BufRead, BufReader};
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                log::info!("[ScreenRecorder] {}", line);
            }
        });
    }

    log::info!("ScreenRecorder started successfully");
    *recording_process = Some(child);
    Ok(output_path)
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

// ===== GOOGLE DRIVE EXPORT =====

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleDriveConfig {
    api_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleDriveFileMetadata {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    parents: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mime_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GoogleDriveFile {
    id: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GoogleDriveFileList {
    files: Vec<GoogleDriveFile>,
}

// Find or create ClipForge folder in Google Drive
async fn get_or_create_clipforge_folder(api_key: &str) -> Result<String, String> {
    log::info!("Getting or creating ClipForge folder");

    let client = reqwest::Client::new();

    // Search for existing ClipForge folder
    let search_url = "https://www.googleapis.com/drive/v3/files";
    let query = "name='ClipForge' and mimeType='application/vnd.google-apps.folder' and trashed=false";

    let response = client
        .get(search_url)
        .query(&[("q", query), ("fields", "files(id,name)")])
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to search for ClipForge folder: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Google Drive API error ({}): {}. Please check your OAuth access token.", status, error_text));
    }

    let file_list: GoogleDriveFileList = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse folder search response: {}", e))?;

    // If folder exists, return its ID
    if let Some(folder) = file_list.files.first() {
        log::info!("Found existing ClipForge folder: {}", folder.id);
        return Ok(folder.id.clone());
    }

    // Create new folder
    log::info!("Creating new ClipForge folder");
    let folder_metadata = GoogleDriveFileMetadata {
        name: "ClipForge".to_string(),
        parents: None,
        mime_type: Some("application/vnd.google-apps.folder".to_string()),
    };

    let create_response = client
        .post(search_url)
        .query(&[("fields", "id,name")])
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&folder_metadata)
        .send()
        .await
        .map_err(|e| format!("Failed to create ClipForge folder: {}", e))?;

    if !create_response.status().is_success() {
        let status = create_response.status();
        let error_text = create_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Failed to create folder ({}): {}", status, error_text));
    }

    let created_folder: GoogleDriveFile = create_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse folder creation response: {}", e))?;

    log::info!("Created ClipForge folder: {}", created_folder.id);
    Ok(created_folder.id)
}

// Upload file to Google Drive
async fn upload_to_google_drive(file_path: &str, filename: &str, folder_id: &str, api_key: &str) -> Result<String, String> {
    log::info!("Uploading {} to Google Drive folder {}", filename, folder_id);

    let client = reqwest::Client::new();

    // Read the video file
    let file_data = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read video file: {}", e))?;

    let file_size = file_data.len();
    log::info!("File size: {} bytes ({:.2} MB)", file_size, file_size as f64 / 1_048_576.0);

    // Create metadata
    let metadata = GoogleDriveFileMetadata {
        name: filename.to_string(),
        parents: Some(vec![folder_id.to_string()]),
        mime_type: Some("video/mp4".to_string()),
    };

    let metadata_json = serde_json::to_string(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    // Create multipart upload
    let metadata_part = reqwest::multipart::Part::text(metadata_json)
        .mime_str("application/json")
        .map_err(|e| format!("Failed to create metadata part: {}", e))?;

    let file_part = reqwest::multipart::Part::bytes(file_data)
        .file_name(filename.to_string())
        .mime_str("video/mp4")
        .map_err(|e| format!("Failed to create file part: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("metadata", metadata_part)
        .part("file", file_part);

    // Upload to Google Drive (multipart upload)
    let upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink";

    log::info!("Sending upload request...");
    let response = client
        .post(upload_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to upload to Google Drive: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Upload failed ({}): {}", status, error_text));
    }

    let upload_response: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse upload response: {}", e))?;

    let file_id = upload_response["id"]
        .as_str()
        .ok_or("No file ID in response")?
        .to_string();

    let web_view_link = upload_response["webViewLink"]
        .as_str()
        .unwrap_or("No link available");

    log::info!("Upload successful! File ID: {}, Link: {}", file_id, web_view_link);
    Ok(web_view_link.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleDriveExportOptions {
    input_path: String,
    filename: String,
    api_key: String,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
}

#[tauri::command]
async fn export_to_google_drive(options: GoogleDriveExportOptions) -> Result<String, String> {
    log::info!("Starting Google Drive export: {}", options.filename);

    // First, export the video locally to a temp file
    let temp_dir = std::env::temp_dir();
    let temp_output = temp_dir.join(format!("clipforge_gdrive_{}", options.filename));
    let temp_output_str = temp_output.to_string_lossy().to_string();

    log::info!("Exporting to temp file: {}", temp_output_str);

    // Export video locally first
    export_video(ExportOptions {
        input_path: options.input_path.clone(),
        output_path: temp_output_str.clone(),
        trim_start: options.trim_start,
        trim_end: options.trim_end,
    })?;

    // Get or create ClipForge folder
    let folder_id = get_or_create_clipforge_folder(&options.api_key).await?;

    // Upload to Google Drive
    let drive_link = upload_to_google_drive(&temp_output_str, &options.filename, &folder_id, &options.api_key).await?;

    // Clean up temp file
    let _ = std::fs::remove_file(temp_output);

    log::info!("Google Drive export complete: {}", drive_link);
    Ok(drive_link)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleDriveMultiClipExportOptions {
    clips: Vec<ClipSegment>,
    filename: String,
    api_key: String,
}

#[tauri::command]
async fn export_multi_clip_to_google_drive(options: GoogleDriveMultiClipExportOptions, window: tauri::Window) -> Result<String, String> {
    log::info!("Starting multi-clip Google Drive export: {}", options.filename);

    // First, export the multi-clip video locally to a temp file
    let temp_dir = std::env::temp_dir();
    let temp_output = temp_dir.join(format!("clipforge_gdrive_{}", options.filename));
    let temp_output_str = temp_output.to_string_lossy().to_string();

    log::info!("Exporting multi-clip to temp file: {}", temp_output_str);

    // Export multi-clip video locally first
    export_multi_clip(MultiClipExportOptions {
        clips: options.clips,
        output_path: temp_output_str.clone(),
    }, window)?;

    // Get or create ClipForge folder
    let folder_id = get_or_create_clipforge_folder(&options.api_key).await?;

    // Upload to Google Drive
    let drive_link = upload_to_google_drive(&temp_output_str, &options.filename, &folder_id, &options.api_key).await?;

    // Clean up temp file
    let _ = std::fs::remove_file(temp_output);

    log::info!("Google Drive multi-clip export complete: {}", drive_link);
    Ok(drive_link)
}

// ===== TRANSCRIPTION =====

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptSegment {
    start: f64,
    end: f64,
    text: String,
    confidence: f64,
    #[serde(default)]
    is_filler: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionResult {
    segments: Vec<TranscriptSegment>,
    full_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIWord {
    word: String,
    start: f64,
    end: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAISegment {
    id: u32,
    start: f64,
    end: f64,
    text: String,
    #[serde(default)]
    tokens: Vec<u32>,
    temperature: f64,
    avg_logprob: f64,
    compression_ratio: f64,
    no_speech_prob: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAITranscriptionResponse {
    task: String,
    language: String,
    duration: f64,
    text: String,
    segments: Vec<OpenAISegment>,
    #[serde(default)]
    words: Vec<OpenAIWord>,
}

// Extract audio from video file
fn extract_audio(video_path: &str) -> Result<PathBuf, String> {
    log::info!("Checking for audio stream in: {}", video_path);

    // First, check if the video has an audio stream using ffprobe
    let ffprobe = find_ffprobe();
    let probe_output = Command::new(&ffprobe)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-select_streams", "a",  // Only select audio streams
            video_path
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    let json_str = String::from_utf8_lossy(&probe_output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    // Check if there are any audio streams
    let audio_streams = json["streams"].as_array()
        .map(|arr| arr.len())
        .unwrap_or(0);

    if audio_streams == 0 {
        log::warn!("No audio stream found in video: {}", video_path);
        return Err("This video has no audio track. Please select a video with audio to transcribe.".to_string());
    }

    log::info!("Found {} audio stream(s), extracting audio", audio_streams);

    let temp_dir = std::env::temp_dir();
    let audio_path = temp_dir.join("clipforge_audio.mp3");

    let ffmpeg = find_ffmpeg();
    let output = Command::new(&ffmpeg)
        .args(&[
            "-i", video_path,
            "-vn",  // No video
            "-acodec", "libmp3lame",
            "-ab", "192k",
            "-ar", "44100",
            "-af", "aresample=async=1:first_pts=0",  // Ensure audio starts at 0 and preserves duration
            "-y",
            audio_path.to_str().unwrap()
        ])
        .output()
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg audio extraction failed: {}", stderr));
    }

    // Verify extracted audio duration matches video
    let ffprobe = find_ffprobe();
    let audio_probe = Command::new(&ffprobe)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            audio_path.to_str().unwrap()
        ])
        .output()
        .map_err(|e| format!("Failed to probe audio: {}", e))?;

    let audio_json_str = String::from_utf8_lossy(&audio_probe.stdout);
    if let Ok(audio_json) = serde_json::from_str::<serde_json::Value>(&audio_json_str) {
        if let Some(duration_str) = audio_json["format"]["duration"].as_str() {
            if let Ok(audio_duration) = duration_str.parse::<f64>() {
                log::info!("Extracted audio duration: {:.2}s", audio_duration);
            }
        }
    }

    log::info!("Audio extracted to: {:?}", audio_path);
    Ok(audio_path)
}

// Transcribe audio using OpenAI Whisper API
async fn transcribe_with_openai(audio_path: &PathBuf, api_key: &str) -> Result<TranscriptionResult, String> {
    log::info!("Transcribing audio with OpenAI Whisper: {:?}", audio_path);

    let client = reqwest::Client::new();

    // Read the audio file
    let file_data = std::fs::read(audio_path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;

    // Get filename for the multipart form
    let filename = audio_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio.mp3");

    // Create multipart form
    let file_part = reqwest::multipart::Part::bytes(file_data)
        .file_name(filename.to_string())
        .mime_str("audio/mpeg")
        .map_err(|e| format!("Failed to create file part: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", "whisper-1")
        .text("response_format", "verbose_json")
        .text("timestamp_granularities[]", "segment");

    // Send request to OpenAI
    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to send transcription request: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("OpenAI API request failed ({}): {}", status, error_text));
    }

    let openai_response: OpenAITranscriptionResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

    log::info!("Transcription completed. Duration: {}s, Language: {}",
               openai_response.duration, openai_response.language);

    // Convert OpenAI segments to our format
    let filler_words = vec!["um", "uh", "like", "so", "basically", "actually", "literally", "you know", "i mean"];

    let segments: Vec<TranscriptSegment> = openai_response.segments
        .iter()
        .enumerate()
        .map(|(i, seg)| {
            log::info!("Segment {}: {:.2}s - {:.2}s: \"{}\"", i, seg.start, seg.end, seg.text.trim());

            // Check if segment contains filler words
            let is_filler = filler_words.iter().any(|filler| {
                seg.text.to_lowercase().contains(filler)
            });

            TranscriptSegment {
                start: seg.start,
                end: seg.end,
                text: seg.text.trim().to_string(),
                confidence: (-seg.avg_logprob).min(1.0).max(0.0), // Convert logprob to confidence-like score
                is_filler,
            }
        })
        .collect();

    log::info!("Processed {} segments", segments.len());

    Ok(TranscriptionResult {
        segments,
        full_text: openai_response.text,
    })
}

#[tauri::command]
async fn transcribe_video(video_path: String, api_key: String) -> Result<TranscriptionResult, String> {
    log::info!("Starting transcription for video: {}", video_path);

    // Extract audio from video
    let audio_path = extract_audio(&video_path)?;

    // Transcribe with OpenAI Whisper
    let result = transcribe_with_openai(&audio_path, &api_key).await?;

    // Clean up temp audio file
    let _ = std::fs::remove_file(audio_path);

    log::info!("Transcription complete!");
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .manage(RecordingState {
      process: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![
      import_video,
      export_video,
      export_multi_clip,
      export_to_google_drive,
      export_multi_clip_to_google_drive,
      start_recording,
      stop_recording,
      start_test_recording,
      #[cfg(target_os = "macos")]
      start_screencapturekit_recording,
      open_in_native_player,
      list_audio_devices,
      transcribe_video,
      generate_waveform
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
