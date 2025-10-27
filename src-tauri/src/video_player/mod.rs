use tauri::{command, AppHandle, Runtime, Window};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct PlayerPosition {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

// Store the player view for cleanup
static PLAYER_VIEW: Mutex<Option<usize>> = Mutex::new(None);

#[command]
pub async fn create_native_player<R: Runtime>(
    window: Window<R>,
    video_path: String,
    position: PlayerPosition,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        create_macos_player(window, video_path, position).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Native player only supported on macOS".to_string())
    }
}

#[cfg(target_os = "macos")]
async fn create_macos_player<R: Runtime>(
    window: Window<R>,
    video_path: String,
    position: PlayerPosition,
) -> Result<(), String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class};
    use cocoa::base::{id, nil, YES, NO};
    use cocoa::foundation::{NSRect, NSPoint, NSSize, NSString, NSURL};
    use cocoa::appkit::{NSView, NSWindow};

    unsafe {
        // Clean up any existing player first
        if let Ok(mut player_opt) = PLAYER_VIEW.lock() {
            if let Some(old_player) = *player_opt {
                let old_view: id = old_player as *mut Object;
                let _: () = msg_send![old_view, removeFromSuperview];
                let _: () = msg_send![old_view, release];
                *player_opt = None;
            }
        }

        // Get the Tauri window
        let ns_window = window.ns_window().map_err(|e| format!("Failed to get NSWindow: {}", e))? as id;
        let content_view: id = msg_send![ns_window, contentView];

        // Get content view bounds to convert coordinates
        let content_bounds: NSRect = msg_send![content_view, bounds];

        // Convert web coordinates (top-left origin) to macOS coordinates (bottom-left origin)
        // WebView Y is from top, macOS Y is from bottom
        let mac_y = content_bounds.size.height - position.y - position.height;

        println!("Creating player at web pos: ({}, {}) size: ({}, {})",
                 position.x, position.y, position.width, position.height);
        println!("Content bounds: {} x {}", content_bounds.size.width, content_bounds.size.height);
        println!("Converted to macOS pos: ({}, {})", position.x, mac_y);

        // Create AVPlayerView
        let player_view_class = Class::get("AVPlayerView").ok_or("AVPlayerView class not found")?;
        let player_view: id = msg_send![player_view_class, alloc];

        let frame = NSRect::new(
            NSPoint::new(position.x, mac_y),
            NSSize::new(position.width, position.height),
        );
        let player_view: id = msg_send![player_view, initWithFrame:frame];

        // Create URL from path
        let ns_string = NSString::alloc(nil).init_str(&video_path);
        let file_url: id = msg_send![Class::get("NSURL").unwrap(), fileURLWithPath:ns_string];

        println!("Loading video from: {}", video_path);

        // Create AVPlayer
        let player_class = Class::get("AVPlayer").ok_or("AVPlayer class not found")?;
        let player: id = msg_send![player_class, playerWithURL:file_url];

        // Set player to view
        let _: () = msg_send![player_view, setPlayer:player];

        // Configure player view
        let _: () = msg_send![player_view, setControlsStyle:0]; // No controls - we have our own
        let _: () = msg_send![player_view, setShowsFullScreenToggleButton:NO];

        // Make sure the view is visible and interactive
        let _: () = msg_send![player_view, setWantsLayer:YES];
        let layer: id = msg_send![player_view, layer];
        let _: () = msg_send![layer, setBackgroundColor:nil];

        // Set autoresizing mask to follow parent
        let _: () = msg_send![player_view, setAutoresizingMask:18]; // Width + Height resizable

        // Add to content view
        let _: () = msg_send![content_view, addSubview:player_view positioned:1 relativeTo:nil]; // NSWindowAbove

        // Store the player view for cleanup
        if let Ok(mut player_opt) = PLAYER_VIEW.lock() {
            *player_opt = Some(player_view as usize);
        }

        // Auto-play
        let _: () = msg_send![player, play];

        println!("Native player created successfully");
    }

    Ok(())
}

#[command]
pub fn destroy_native_player() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc::{msg_send, sel, sel_impl};
        use cocoa::base::id;
        use objc::runtime::Object;

        unsafe {
            if let Ok(mut player_opt) = PLAYER_VIEW.lock() {
                if let Some(player_view) = *player_opt {
                    let view: id = player_view as *mut Object;

                    // Get the player and stop it
                    let player: id = msg_send![view, player];
                    if player != std::ptr::null_mut() {
                        let _: () = msg_send![player, pause];
                    }

                    // Remove from superview and release
                    let _: () = msg_send![view, removeFromSuperview];
                    let _: () = msg_send![view, release];
                    *player_opt = None;

                    println!("Native player destroyed");
                }
            }
        }
    }

    Ok(())
}
