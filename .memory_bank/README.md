# ClipForge Memory Bank

## Recent Changes (2025-10-28)

### OpenAI Whisper Integration
Migrated transcription from AssemblyAI to OpenAI Whisper API for better accuracy and simpler implementation.

**Key Changes:**
- Replaced AssemblyAI API calls with OpenAI Whisper single-request API
- No polling required - Whisper returns results immediately
- Added audio stream detection before extraction to prevent errors on videos without audio
- Improved FFmpeg audio extraction with `aresample=async=1:first_pts=0` filter for accurate duration preservation

**Files Modified:**
- `src-tauri/src/lib.rs`: Complete transcription backend rewrite (lines 908-1100)
  - `extract_audio()`: Added audio stream validation and duration logging
  - `transcribe_with_openai()`: New function using OpenAI Whisper API with multipart form upload
  - Removed old AssemblyAI functions (upload, request, poll)

- `src/App.jsx`:
  - Changed environment variable from `VITE_ASSEMBLYAI_API_KEY` to `VITE_OPENAI_API_KEY`
  - Updated error messages to reference OpenAI
  - Fixed variable ordering issues (moved `useTimeline()` hook to line 25)

- `.env.example`: Updated template to use OpenAI API key
  - `VITE_OPENAI_API_KEY=your_api_key_here`
  - Link to https://platform.openai.com/api-keys

### Bug Fixes
**React Temporal Dead Zone Errors:**
- Fixed "Cannot access uninitialized variable" errors in App.jsx
- Moved `useTimeline()` hook call before any code using its returned values
- Moved `playingClip` calculation before it's referenced

### UI Improvements
**Transcript Panel:**
- Removed filler word badges and "Remove Filler" buttons for cleaner UI
- Transcribe button now always appears when no transcript exists
- Improved button tooltip: "Generate AI transcript using OpenAI Whisper"

**Files Modified:**
- `src/components/TranscriptPanel.jsx`: Removed filler word UI elements (lines 70-77)

## Environment Setup

### Required Environment Variables
Create a `.env` file in the root directory:

```env
# OpenAI API Key for Whisper transcription
VITE_OPENAI_API_KEY=sk-...your-key-here
```

Get your API key at: https://platform.openai.com/api-keys

### Important Notes
- The `.env` file is gitignored for security
- Restart the dev server after adding/changing environment variables
- Transcription only works on videos with audio tracks

## Architecture

### Transcription Flow
1. User clicks "🤖 Transcribe" button in TranscriptPanel
2. Frontend calls Rust backend via Tauri IPC (`transcribe_video` command)
3. Backend:
   - Checks for audio stream using ffprobe
   - Extracts audio to temporary MP3 file
   - Sends multipart form request to OpenAI Whisper API
   - Receives complete transcription with segments and timestamps
   - Cleans up temporary audio file
4. Frontend receives segments and displays in transcript panel with:
   - Clickable timestamps for seeking
   - Active segment highlighting
   - Auto-expansion when transcript available

### Key Functions
**Rust (src-tauri/src/lib.rs):**
- `extract_audio()`: FFmpeg audio extraction with validation
- `transcribe_with_openai()`: OpenAI Whisper API integration
- `transcribe_video()`: Main command exposed to frontend

**React (src/App.jsx):**
- `handleTranscribeVideo()`: Initiates transcription with API key validation
- Falls back to first clip if no clip is currently playing

## Dependencies

### Rust
- `reqwest = { version = "0.11", features = ["json", "multipart"] }`
- `tokio = { version = "1", features = ["full"] }`

### External Tools
- FFmpeg (required): Used for audio extraction and video processing
- ffprobe (required): Used for metadata extraction and audio stream detection

## Known Issues & Limitations
- Transcription requires videos with audio tracks
- First transcription after opening app may take a few seconds
- Timestamps are provided by OpenAI Whisper and may have minor inaccuracies
- Large video files will take longer to transcribe

## Future Enhancements
- Add support for multiple languages
- Allow editing transcript text
- Export transcript to SRT/VTT format
- Batch transcription for multiple clips
- Transcript search/filter functionality
