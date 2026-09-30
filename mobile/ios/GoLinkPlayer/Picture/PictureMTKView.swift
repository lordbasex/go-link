// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import CoreVideo
import GoLinkCore
import MetalKit
import UIKit
@preconcurrency import WebRTC

/**
 * The game's picture on the GPU: an MTKView that receives WebRTC's decoded
 * frames (RTCVideoRenderer) and draws them with PictureRenderer. Frames
 * arrive on a WebRTC thread and only replace the pending one; the view
 * ticks at the screen's highest rate (120 Hz on ProMotion) and draws only
 * when there is a new frame, a new setting or a new size, so a 60 fps game
 * is shown within one 8 ms tick of its arrival and nothing is drawn twice.
 */
final class PictureMTKView: MTKView, RTCVideoRenderer {
    private let renderer: PictureRenderer
    private let queue: MTLCommandQueue
    private var textureCache: CVMetalTextureCache?
    /** Frames waiting for the next tick (the newest wins). */
    private let lock = NSLock()
    private var pending: RTCVideoFrame?
    private var dirty = true
    private var lastDrawableSize = CGSize.zero
    /** I420 planes: a small ring, so a plane is never rewritten while the GPU reads it. */
    private var planes: [[MTLTexture]] = []
    private var planeIndex = 0
    private let inFlight = DispatchSemaphore(value: 3)
    /** Called on the main thread after each new frame is drawn (the debug lab counts them). */
    var onFrameDrawn: (() -> Void)?

    var options: PictureRenderer.Options {
        didSet { if options != oldValue { dirty = true } }
    }

    /** nil when this device has no Metal or the shaders do not compile (the caller falls back). */
    init?(options: PictureRenderer.Options) {
        guard let device = MTLCreateSystemDefaultDevice(),
              let queue = device.makeCommandQueue(),
              let renderer = PictureRenderer.make(device: device, targetFormat: .bgra8Unorm) else { return nil }
        self.renderer = renderer
        self.queue = queue
        self.options = options
        super.init(frame: .zero, device: device)
        CVMetalTextureCacheCreate(nil, nil, device, nil, &textureCache)
        colorPixelFormat = .bgra8Unorm
        framebufferOnly = true
        clearColor = MTLClearColor(red: 0.02, green: 0.024, blue: 0.04, alpha: 1)
        preferredFramesPerSecond = ScreenRateMonitor.maxFps
        enableSetNeedsDisplay = false
        isPaused = false
        autoResizeDrawable = true
        backgroundColor = .black
        isOpaque = true
        isUserInteractionEnabled = false
        accessibilityIdentifier = "video"
    }

    @available(*, unavailable)
    required init(coder: NSCoder) { fatalError("init(coder:) is not used") }

    // MARK: RTCVideoRenderer (any thread)

    func setSize(_ size: CGSize) {}

    func renderFrame(_ frame: RTCVideoFrame?) {
        guard let frame else { return }
        lock.lock()
        pending = frame
        lock.unlock()
    }

    /** A new setting or size shows at once, even on a paused game. */
    func redraw() { dirty = true }

    // MARK: Drawing (main thread)

    override func draw(_ rect: CGRect) {
        lock.lock()
        let frame = pending
        pending = nil
        lock.unlock()
        if drawableSize != lastDrawableSize {
            lastDrawableSize = drawableSize
            dirty = true
        }
        // Nothing new, or nothing to draw yet.
        guard frame != nil || (dirty && renderer.sourceSize != nil) else { return }
        guard inFlight.wait(timeout: .now()) == .success else {
            // The GPU is behind: keep the frame for the next tick.
            if let frame {
                lock.lock()
                if pending == nil { pending = frame }
                lock.unlock()
            }
            return
        }
        guard let cb = queue.makeCommandBuffer() else {
            inFlight.signal()
            return
        }
        var keep: [Any] = []
        var o = options
        o.scale = Double(contentScaleFactor)
        o.reducedMotion = UIAccessibility.isReduceMotionEnabled
        if let frame, let input = upload(frame, keep: &keep) {
            renderer.encodeFrame(input.input, width: input.width, height: input.height, options: o, into: cb)
        }
        var drawn = false
        if renderer.sourceSize != nil, let drawable = currentDrawable {
            drawn = renderer.encodePicture(into: drawable.texture, options: o, cb: cb)
            if drawn { cb.present(drawable) }
        }
        let sem = inFlight
        cb.addCompletedHandler { _ in
            _ = keep // the pixel buffer's textures live until the GPU is done
            sem.signal()
        }
        cb.commit()
        if drawn { dirty = false }
        if frame != nil, drawn { onFrameDrawn?() }
    }

    /** The frame's planes as textures: NV12 pixel buffers directly, anything else as I420. */
    private func upload(_ frame: RTCVideoFrame, keep: inout [Any]) -> (input: PictureRenderer.Input, width: Int, height: Int)? {
        if let cv = frame.buffer as? RTCCVPixelBuffer, let cache = textureCache {
            let pb = cv.pixelBuffer
            let format = CVPixelBufferGetPixelFormatType(pb)
            let full = format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            if full || format == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange {
                let w = CVPixelBufferGetWidthOfPlane(pb, 0), h = CVPixelBufferGetHeightOfPlane(pb, 0)
                let cw = CVPixelBufferGetWidthOfPlane(pb, 1), ch = CVPixelBufferGetHeightOfPlane(pb, 1)
                var yRef: CVMetalTexture?
                var cRef: CVMetalTexture?
                CVMetalTextureCacheCreateTextureFromImage(nil, cache, pb, nil, .r8Unorm, w, h, 0, &yRef)
                CVMetalTextureCacheCreateTextureFromImage(nil, cache, pb, nil, .rg8Unorm, cw, ch, 1, &cRef)
                if let yRef, let cRef, let y = CVMetalTextureGetTexture(yRef), let c = CVMetalTextureGetTexture(cRef) {
                    keep = [yRef, cRef, cv]
                    return (.nv12(y: y, cbcr: c, fullRange: full), w, h)
                }
            }
        }
        let i420 = frame.buffer.toI420()
        let w = Int(i420.width), h = Int(i420.height)
        let cw = Int(i420.chromaWidth), ch = Int(i420.chromaHeight)
        guard w > 0, h > 0 else { return nil }
        if planes.first?.first?.width != w || planes.first?.first?.height != h {
            planes = (0..<3).compactMap { _ in
                guard let y = plane(w, h), let u = plane(cw, ch), let v = plane(cw, ch) else { return nil }
                return [y, u, v]
            }
        }
        guard planes.count == 3 else { return nil }
        planeIndex = (planeIndex + 1) % planes.count
        let set = planes[planeIndex]
        set[0].replace(region: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0, withBytes: i420.dataY, bytesPerRow: Int(i420.strideY))
        set[1].replace(region: MTLRegionMake2D(0, 0, cw, ch), mipmapLevel: 0, withBytes: i420.dataU, bytesPerRow: Int(i420.strideU))
        set[2].replace(region: MTLRegionMake2D(0, 0, cw, ch), mipmapLevel: 0, withBytes: i420.dataV, bytesPerRow: Int(i420.strideV))
        keep = [i420]
        return (.i420(y: set[0], u: set[1], v: set[2], fullRange: false), w, h)
    }

    private func plane(_ w: Int, _ h: Int) -> MTLTexture? {
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .r8Unorm, width: max(1, w), height: max(1, h), mipmapped: false)
        d.usage = .shaderRead
        d.storageMode = .shared
        return device?.makeTexture(descriptor: d)
    }
}
