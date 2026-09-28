// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless && darwin

#import <Cocoa/Cocoa.h>

extern void goPanelResigned(void);

// mwAttachPanel watches the window with this title: when it becomes key it
// moves under the mouse (the user just clicked the tray icon), floats like
// a popover and gets rounded corners; when it loses focus it hides, unless
// the click was on the menu bar (the tray icon toggles it itself).
void mwAttachPanel(const char *title) {
	NSString *want = [NSString stringWithUTF8String:title];
	dispatch_async(dispatch_get_main_queue(), ^{
		NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
		[nc addObserverForName:NSWindowDidBecomeKeyNotification object:nil queue:nil usingBlock:^(NSNotification *n) {
			NSWindow *w = n.object;
			if (![w.title isEqualToString:want]) {
				return;
			}
			NSPoint mouse = [NSEvent mouseLocation];
			NSScreen *screen = [NSScreen mainScreen];
			for (NSScreen *s in [NSScreen screens]) {
				if (NSPointInRect(mouse, s.frame)) {
					screen = s;
				}
			}
			NSRect vf = screen.visibleFrame;
			NSRect f = w.frame;
			CGFloat x = mouse.x - f.size.width / 2;
			x = MAX(NSMinX(vf) + 8, MIN(x, NSMaxX(vf) - f.size.width - 8));
			[w setFrameTopLeftPoint:NSMakePoint(x, NSMaxY(vf) - 6)];
			w.level = NSPopUpMenuWindowLevel;
			w.hasShadow = YES;
			NSView *v = w.contentView;
			v.wantsLayer = YES;
			v.layer.cornerRadius = 14;
			v.layer.masksToBounds = YES;
			w.opaque = NO;
			w.backgroundColor = [NSColor clearColor];
		}];
		[nc addObserverForName:NSWindowDidResignKeyNotification object:nil queue:nil usingBlock:^(NSNotification *n) {
			NSWindow *w = n.object;
			if (![w.title isEqualToString:want] || !w.visible) {
				return;
			}
			NSPoint mouse = [NSEvent mouseLocation];
			NSScreen *screen = w.screen ?: [NSScreen mainScreen];
			if (mouse.y >= NSMaxY(screen.visibleFrame)) {
				return; // a click on the menu bar: the tray icon toggles it
			}
			goPanelResigned();
		}];
	});
}

// mwStyleWindow gives the window with this title MacDub's look: no title
// bar, the content under the traffic lights, and the window movable by
// its background.
void mwStyleWindow(const char *title) {
	NSString *want = [NSString stringWithUTF8String:title];
	dispatch_async(dispatch_get_main_queue(), ^{
		void (^style)(NSWindow *) = ^(NSWindow *w) {
			if (![w.title isEqualToString:want] || (w.styleMask & NSWindowStyleMaskFullSizeContentView)) {
				return;
			}
			w.styleMask |= NSWindowStyleMaskFullSizeContentView | NSWindowStyleMaskResizable;
			w.titlebarAppearsTransparent = YES;
			w.titleVisibility = NSWindowTitleHidden;
			w.minSize = NSMakeSize(900, 600);
			// macOS remembers the size and place the host leaves the window
			// in, and restores them on the next start.
			[w setFrameAutosaveName:@"go-link main window"];
			// Nudge the frame so the renderer picks up the taller content.
			NSRect f = w.frame;
			[w setFrame:NSMakeRect(f.origin.x, f.origin.y, f.size.width, f.size.height + 1) display:YES];
			[w setFrame:f display:YES];
		};
		for (NSWindow *w in [NSApp windows]) {
			style(w);
		}
		[[NSNotificationCenter defaultCenter] addObserverForName:NSWindowDidBecomeKeyNotification object:nil queue:nil usingBlock:^(NSNotification *n) {
			style(n.object);
		}];
	});
}

static NSPoint mwDragMouse;
static NSPoint mwDragOrigin;

static NSWindow *mwWindowTitled(NSString *title) {
	for (NSWindow *w in [NSApp windows]) {
		if ([w.title isEqualToString:title]) {
			return w;
		}
	}
	return nil;
}

// mwDragBegin and mwDragMove move the window with the mouse, using screen
// coordinates, so the moving window never skews the deltas.
void mwDragBegin(const char *title) {
	NSWindow *w = mwWindowTitled([NSString stringWithUTF8String:title]);
	mwDragMouse = [NSEvent mouseLocation];
	mwDragOrigin = w ? w.frame.origin : NSZeroPoint;
}

void mwDragMove(const char *title) {
	NSWindow *w = mwWindowTitled([NSString stringWithUTF8String:title]);
	if (!w) {
		return;
	}
	NSPoint m = [NSEvent mouseLocation];
	[w setFrameOrigin:NSMakePoint(mwDragOrigin.x + m.x - mwDragMouse.x, mwDragOrigin.y + m.y - mwDragMouse.y)];
}

// mwZoom maximizes or restores the window, like a double click on a title
// bar.
void mwZoom(const char *title) {
	[mwWindowTitled([NSString stringWithUTF8String:title]) zoom:nil];
}
