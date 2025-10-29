use std::process::Command;

fn main() {
    // Compile Swift ScreenRecorder helper on macOS
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=swift-helper/ScreenRecorder.swift");
        println!("cargo:warning=Compiling ScreenRecorder Swift helper...");

        let output = Command::new("swiftc")
            .args(&[
                "-O",
                "-target", "arm64-apple-macos13.0",
                "-framework", "ScreenCaptureKit",
                "-framework", "AVFoundation",
                "-framework", "Foundation",
                "swift-helper/ScreenRecorder.swift",
                "-o", "swift-helper/ScreenRecorder"
            ])
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .expect("Failed to execute swiftc - make sure Xcode Command Line Tools are installed");

        if !output.status.success() {
            eprintln!("Swift compilation failed:");
            eprintln!("{}", String::from_utf8_lossy(&output.stderr));
            panic!("Failed to compile ScreenRecorder.swift");
        }

        println!("cargo:warning=ScreenRecorder compiled successfully");
    }

    tauri_build::build()
}
