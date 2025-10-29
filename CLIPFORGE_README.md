# ClipForge

ClipForge is a desktop video editing application built with Tauri, React, and Rust. It provides powerful video editing capabilities with features like timeline-based editing, transcript highlighting, drag-and-drop functionality, and more.

## Features

- **Screen & Webcam Recording** - Record your screen, webcam, or both simultaneously
- **Multi-segment audio playback** - Web Audio API for precise audio control
- **Timeline-based editing** - Drag-and-drop video clips and audio tracks
- **Transcript highlighting** - Color-coded segments synced to timeline
- **Clip extraction** - Extract specific timeline sections
- **Media library** - Organize and manage your video files
- **Video merging** - Combine multiple clips into one
- **Thumbnail generation** - Automatic video thumbnails
- **AI Transcription** - OpenAI Whisper integration for speech-to-text

## For End Users

### Download and Install

#### macOS

1. Download the latest `ClipForge.app` or `.dmg` file from the releases page
2. **For .app files:**
   - Extract the .zip if downloaded as a zip file
   - Drag `ClipForge.app` to your Applications folder
   - On first launch, right-click the app and select "Open" (required for unsigned apps)
3. **For .dmg files:**
   - Double-click the `.dmg` file to mount it
   - Drag `ClipForge.app` to the Applications folder
   - Eject the DMG
   - On first launch, right-click the app and select "Open"

#### Windows

1. Download the latest `.msi` installer from the releases page
2. Double-click the installer and follow the installation wizard
3. Launch ClipForge from the Start Menu

#### Linux

1. Download the appropriate package for your distribution:
   - `.deb` for Debian/Ubuntu-based systems
   - `.AppImage` for universal Linux support
2. **For .deb packages:**
   ```bash
   sudo dpkg -i ClipForge_0.1.0_amd64.deb
   ```
3. **For AppImage:**
   ```bash
   chmod +x ClipForge_0.1.0_amd64.AppImage
   ./ClipForge_0.1.0_amd64.AppImage
   ```

### System Requirements

- **macOS:** 10.15 (Catalina) or later
- **Windows:** Windows 10 or later
- **Linux:** Modern distribution with glibc 2.31+
- **Memory:** 4GB RAM minimum, 8GB recommended
- **Storage:** 200MB for application + space for video files
- **FFmpeg:** Required for recording features (auto-detected if installed via Homebrew)

### Important: macOS Permissions

ClipForge requires specific permissions to function properly on macOS:

#### Screen Recording Permission (Required for screen recording)
1. Open **System Settings** > **Privacy & Security** > **Screen Recording**
2. Enable permission for **ClipForge**
3. If ClipForge isn't listed, try recording once - you'll be prompted to grant permission
4. Restart ClipForge after granting permission

#### Microphone Permission (Required for audio recording)
1. Open **System Settings** > **Privacy & Security** > **Microphone**
2. Enable permission for **ClipForge**

**Note:** If recording fails with a "not permitted" error, check these permissions first!

### Installing FFmpeg (Required for Recording)

ClipForge uses FFmpeg for screen and webcam recording. Install it via Homebrew:

```bash
brew install ffmpeg
```

ClipForge will automatically detect FFmpeg in these locations:
- `/opt/homebrew/bin/ffmpeg` (Apple Silicon)
- `/usr/local/bin/ffmpeg` (Intel Mac)
- System PATH

## For Developers

### Prerequisites

Before building ClipForge, ensure you have the following installed:

1. **Node.js** (v20 or later)
   - Download from [nodejs.org](https://nodejs.org)
   - Verify: `node --version`

2. **Rust** (latest stable)
   - Install via [rustup](https://rustup.rs/)
   - Verify: `rustc --version`

3. **Platform-specific dependencies:**

   **macOS:**
   - Xcode Command Line Tools: `xcode-select --install`

   **Windows:**
   - Microsoft Visual Studio C++ Build Tools
   - WebView2 (usually pre-installed on Windows 10/11)

   **Linux (Ubuntu/Debian):**
   ```bash
   sudo apt update
   sudo apt install libwebkit2gtk-4.1-dev \
     build-essential \
     curl \
     wget \
     file \
     libssl-dev \
     libgtk-3-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev
   ```

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd ClipForge
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode:**
   ```bash
   npm run tauri:dev
   ```

   This will:
   - Start the Vite dev server for the frontend
   - Launch the Tauri application with hot-reload enabled
   - Automatically reload on file changes

### Building for Production

#### Build for your current platform:

```bash
npm run tauri:build
```

This command will:
1. Build the frontend with Vite (production optimized)
2. Compile the Rust backend
3. Create platform-specific bundles in `src-tauri/target/release/bundle/`

#### Build outputs by platform:

**macOS:**
- `ClipForge.app` - Application bundle
- `ClipForge_0.1.0_aarch64.dmg` - DMG installer (Apple Silicon)
- Located in: `src-tauri/target/release/bundle/macos/`

**Windows:**
- `ClipForge_0.1.0_x64_en-US.msi` - MSI installer
- Located in: `src-tauri/target/release/bundle/msi/`

**Linux:**
- `clipforge_0.1.0_amd64.deb` - Debian package
- `clipforge_0.1.0_amd64.AppImage` - AppImage
- Located in: `src-tauri/target/release/bundle/deb/` or `appimage/`

### Project Structure

```
ClipForge/
├── src/                    # React frontend source
│   ├── components/        # React components
│   ├── styles/           # CSS files
│   └── main.jsx          # Entry point
├── src-tauri/             # Rust backend
│   ├── src/              # Rust source code
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── dist/                  # Built frontend (generated)
├── package.json          # Node dependencies
└── vite.config.js        # Vite configuration
```

### Available Scripts

- `npm run dev` - Start Vite dev server only
- `npm run build:frontend` - Build frontend for production
- `npm run tauri:dev` - Run app in development mode
- `npm run tauri:build` - Build app for production

### Configuration

#### Changing App Name/Version

Edit `src-tauri/tauri.conf.json`:
```json
{
  "productName": "ClipForge",
  "version": "0.1.0",
  "identifier": "com.clipforge.desktop"
}
```

#### Changing App Icons

Replace icons in `src-tauri/icons/`:
- `icon.icns` - macOS icon
- `icon.ico` - Windows icon
- PNG files at various sizes for Linux

### Troubleshooting

#### Build fails on macOS with DMG error
- The .app bundle is still created successfully
- You can distribute the .app directly or zip it

#### "Failed to load resource" errors
- Clear the dist folder: `rm -rf dist`
- Rebuild frontend: `npm run build:frontend`

#### Rust compilation errors
- Update Rust: `rustup update`
- Clear Cargo cache: `cargo clean` in `src-tauri/`

#### Large bundle size warning
- The app includes video.js and other media libraries
- This is expected for video editing applications
- Consider code splitting if bundle size becomes an issue

### Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test thoroughly: `npm run tauri:dev`
5. Build to verify: `npm run tauri:build`
6. Commit your changes: `git commit -m "Add my feature"`
7. Push to your fork: `git push origin feature/my-feature`
8. Open a Pull Request

### License

[Add your license information here]

### Support

For issues, questions, or feature requests, please open an issue on the GitHub repository.

---

Built with [Tauri](https://tauri.app), [React](https://react.dev), and [Rust](https://rust-lang.org)
