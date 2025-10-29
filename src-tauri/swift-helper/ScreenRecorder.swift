import Foundation
import ScreenCaptureKit
import AVFoundation

// Entry point
if #available(macOS 13.0, *) {
    await ScreenRecorderCLI.main()
} else {
    print("[ScreenRecorder] Error: Requires macOS 13.0 or later")
    exit(1)
}

@available(macOS 13.0, *)
class ScreenRecorder: NSObject, SCStreamDelegate, SCStreamOutput {
    private var stream: SCStream?
    private var assetWriter: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var videoAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var audioInput: AVAssetWriterInput?
    private var isRecording = false
    private var outputURL: URL
    private var firstSampleTime: CMTime = .zero
    private var lastPresentationTime: CMTime = .zero
    private var frameCount = 0
    private var hasStartedSession = false
    private let sessionLock = NSLock()

    init(outputPath: String) {
        self.outputURL = URL(fileURLWithPath: outputPath)
        super.init()
    }

    func startRecording(displayIndex: Int?, audioEnabled: Bool, microphoneEnabled: Bool) async throws {
        // Get available content
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

        // Select display by index (0 = main display, 1 = second display, etc.)
        let display: SCDisplay?
        if let index = displayIndex, index >= 0 && index < content.displays.count {
            display = content.displays[index]
        } else {
            display = content.displays.first
        }

        guard let display = display else {
            throw RecordingError.noDisplayFound
        }

        // Configure stream
        let config = SCStreamConfiguration()
        config.width = Int(display.width)
        config.height = Int(display.height)
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30) // 30 fps
        config.pixelFormat = kCVPixelFormatType_32BGRA

        // Configure audio capture
        config.capturesAudio = audioEnabled
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48000
        config.channelCount = 2

        // Create content filter
        let filter = SCContentFilter(display: display, excludingWindows: [])

        // Create stream
        let stream = SCStream(filter: filter, configuration: config, delegate: self)

        // Setup asset writer
        try setupAssetWriter(width: config.width, height: config.height, hasAudio: audioEnabled || microphoneEnabled)

        // Add stream output
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label: "com.clipforge.screenrecorder"))

        if audioEnabled {
            try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "com.clipforge.audiorecorder"))
        }

        // Start streaming
        try await stream.startCapture()

        self.stream = stream
        self.isRecording = true

        print("[ScreenRecorder] Recording started: \(outputURL.path)")
    }

    func stopRecording() async throws {
        guard isRecording else { return }

        isRecording = false
        print("[ScreenRecorder] Stopping recording...")

        // Stop capture first
        if let stream = stream {
            try await stream.stopCapture()
            print("[ScreenRecorder] Stream stopped")
        }

        // Give a moment for any pending buffers to flush
        try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds

        // Mark inputs as finished
        if let videoInput = videoInput {
            videoInput.markAsFinished()
            print("[ScreenRecorder] Video input marked finished")
        }
        if let audioInput = audioInput {
            audioInput.markAsFinished()
            print("[ScreenRecorder] Audio input marked finished")
        }

        // End session and finish writing
        if let writer = assetWriter {
            print("[ScreenRecorder] Asset writer status before finish: \(writer.status.rawValue)")

            // End session at the last frame time
            writer.endSession(atSourceTime: lastPresentationTime)

            await writer.finishWriting()
            print("[ScreenRecorder] Asset writer status after finish: \(writer.status.rawValue)")

            if writer.status == .completed {
                print("[ScreenRecorder] Asset writer completed successfully")
            } else if writer.status == .failed {
                if let error = writer.error {
                    print("[ScreenRecorder] Asset writer failed: \(error)")
                    throw error
                } else {
                    print("[ScreenRecorder] Asset writer failed with no error details")
                }
            } else {
                print("[ScreenRecorder] Asset writer in unexpected state: \(writer.status.rawValue)")
            }
        }

        print("[ScreenRecorder] Recording stopped: \(outputURL.path)")
        print("[ScreenRecorder] Total frames recorded: \(frameCount)")
    }

    private func setupAssetWriter(width: Int, height: Int, hasAudio: Bool) throws {
        // Remove existing file
        try? FileManager.default.removeItem(at: outputURL)

        // Create asset writer - use MOV for better macOS compatibility
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)

        // Video settings with H.264 codec
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height
        ]

        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput.expectsMediaDataInRealTime = true

        // Create pixel buffer adaptor for ScreenCaptureKit's raw buffers
        let adaptorSettings: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: adaptorSettings)

        guard writer.canAdd(videoInput) else {
            throw RecordingError.cannotAddVideoInput
        }
        writer.add(videoInput)
        self.videoInput = videoInput
        self.videoAdaptor = adaptor

        // Audio settings with AAC codec
        if hasAudio {
            let audioSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 128000
            ]

            let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            audioInput.expectsMediaDataInRealTime = true

            if writer.canAdd(audioInput) {
                writer.add(audioInput)
                self.audioInput = audioInput
            }
        }

        self.assetWriter = writer
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard isRecording else { return }

        // Start writing session on first frame (only once, thread-safe!)
        sessionLock.lock()
        let shouldStartSession = !hasStartedSession && assetWriter?.status == .unknown
        if shouldStartSession {
            hasStartedSession = true
            firstSampleTime = sampleBuffer.presentationTimeStamp
        }
        sessionLock.unlock()

        if shouldStartSession {
            print("[ScreenRecorder] Starting asset writer session at .zero (first sample type: \(type))")
            assetWriter?.startWriting()
            assetWriter?.startSession(atSourceTime: .zero)
            print("[ScreenRecorder] Asset writer status after start: \(assetWriter?.status.rawValue ?? -1)")

            if assetWriter?.status == .failed, let error = assetWriter?.error {
                print("[ScreenRecorder] ERROR starting writer: \(error)")
            }
        }

        guard assetWriter?.status == .writing else {
            return
        }

        // Retime sample buffer relative to first frame
        let adjustedTime = sampleBuffer.presentationTimeStamp - firstSampleTime
        guard adjustedTime >= .zero else {
            print("[ScreenRecorder] Skipping sample with negative adjusted time")
            return
        }

        let timing = CMSampleTimingInfo(
            duration: sampleBuffer.duration,
            presentationTimeStamp: adjustedTime,
            decodeTimeStamp: sampleBuffer.decodeTimeStamp
        )

        guard let retimedBuffer = try? CMSampleBuffer(copying: sampleBuffer, withNewTiming: [timing]) else {
            print("[ScreenRecorder] Failed to retime sample buffer")
            return
        }

        switch type {
        case .screen:
            // Extract pixel buffer from sample buffer
            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
                // Some samples don't have pixel buffers (metadata frames), skip silently
                return
            }

            if let adaptor = videoAdaptor, adaptor.assetWriterInput.isReadyForMoreMediaData {
                let success = adaptor.append(pixelBuffer, withPresentationTime: adjustedTime)
                if success {
                    frameCount += 1
                    lastPresentationTime = adjustedTime
                } else {
                    print("[ScreenRecorder] Failed to append video pixel buffer at time \(adjustedTime.seconds)")
                }
            }
        case .audio:
            // Log audio format on first audio sample
            if frameCount == 1 {
                if let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer) {
                    let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)
                    if let asbd = asbd {
                        print("[ScreenRecorder] Audio format: sampleRate=\(asbd.pointee.mSampleRate), channels=\(asbd.pointee.mChannelsPerFrame), format=\(asbd.pointee.mFormatID)")
                    }
                } else {
                    print("[ScreenRecorder] No format description in audio sample")
                }
            }

            if let audioInput = audioInput, audioInput.isReadyForMoreMediaData {
                if !audioInput.append(retimedBuffer) {
                    print("[ScreenRecorder] Failed to append audio sample at time \(adjustedTime.seconds)")
                    if let error = assetWriter?.error {
                        print("[ScreenRecorder] Asset writer error: \(error)")
                    }
                }
            }
        case .microphone:
            if let audioInput = audioInput, audioInput.isReadyForMoreMediaData {
                audioInput.append(retimedBuffer)
            }
        @unknown default:
            break
        }
    }

    // MARK: - SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("[ScreenRecorder] Stream stopped with error: \(error)")
        isRecording = false
    }
}

enum RecordingError: Error {
    case noDisplayFound
    case cannotAddVideoInput
    case cannotAddAudioInput
}

// MARK: - CLI Interface

@available(macOS 13.0, *)
struct ScreenRecorderCLI {
    static func main() async {
        let args = CommandLine.arguments

        guard args.count >= 2 else {
            print("Usage: ScreenRecorder <output_path> [display_id] [audio=true|false] [duration=seconds]")
            print("Example: ScreenRecorder /tmp/recording.mov 0 true 10")
            print("Note: Output file should use .mov extension for best compatibility")
            exit(1)
        }

        let outputPath = args[1]
        let displayIndex: Int? = args.count > 2 ? Int(args[2]) : nil
        let audioEnabled = args.count > 3 ? args[3].lowercased() == "true" : true
        let duration = args.count > 4 ? Double(args[4]) ?? 10.0 : 10.0

        let recorder = ScreenRecorder(outputPath: outputPath)

        do {
            print("[ScreenRecorder] Starting recording...")
            print("[ScreenRecorder] Output: \(outputPath)")
            print("[ScreenRecorder] Audio: \(audioEnabled)")
            print("[ScreenRecorder] Duration: \(duration)s")

            try await recorder.startRecording(displayIndex: displayIndex, audioEnabled: audioEnabled, microphoneEnabled: false)

            // Record for specified duration
            try await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))

            try await recorder.stopRecording()

            print("[ScreenRecorder] Recording complete!")
            exit(0)
        } catch {
            print("[ScreenRecorder] Error: \(error)")
            exit(1)
        }
    }
}
