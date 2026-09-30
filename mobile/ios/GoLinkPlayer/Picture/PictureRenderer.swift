// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import Metal

/**
 * The GPU picture renderer (a port of the website's renderer.ts): the
 * decoded frame (I420 planes or an NV12 pixel buffer) is converted to an
 * RGB texture at its own size; a 2x stream (docs/protocol.md, Video scale)
 * is then averaged back to the game's own size, and the picture shader
 * draws that texture with the chosen style and sides into the target. It knows nothing about UIKit or
 * WebRTC, so it can also render offline. make() returns nil when the GPU
 * or the shaders are not available, and the room keeps the plain view.
 */
final class PictureRenderer {
    /** The planes of one decoded frame, already on the GPU. */
    enum Input {
        case i420(y: MTLTexture, u: MTLTexture, v: MTLTexture, fullRange: Bool)
        case nv12(y: MTLTexture, cbcr: MTLTexture, fullRange: Bool)
        /** An RGBA texture as it is (the debug check that compares a 2x picture with the native one). */
        case rgba(MTLTexture)
    }

    struct Options: Equatable {
        var settings: PictureSettings
        /** Where the chosen style starts, 0-1 of the width (the left side is the plain picture); nil = no split. */
        var split: Double?
        /** Width / height as the game is meant to be seen (4:3 for arcades). */
        var aspect: Double
        /** Drawable pixels per point (the shaders scale their details with it). */
        var scale: Double
        var reducedMotion = false
        /**
         * The game's own size when the device sends it 2x (stream_stats
         * video). A frame exactly twice this size is averaged back to it
         * before any style; any other frame is drawn as it is.
         */
        var native: PictureLayout.Size?
    }

    /** The shader colors: the website's tokens (tokens.css, dark theme; the stage always is dark). */
    struct Colors {
        var black = SIMD4<Float>(rgb: 0x05060A)
        var cabinet = SIMD4<Float>(rgb: 0x0B0D13)
        var cabinet2 = SIMD4<Float>(rgb: 0x1A1F2C)
        var bezel = SIMD4<Float>(rgb: 0x07080C)
        var bezelHi = SIMD4<Float>(rgb: 0x3B4254)
        var trim = SIMD4<Float>(rgb: 0xF2A33A)
    }

    /** The ambient texture: tiny on purpose (the blur is free). */
    static let ambientSize = (w: 32, h: 24)

    let device: MTLDevice
    let colors = Colors()
    private let yuvI420: MTLRenderPipelineState
    private let yuvNv12: MTLRenderPipelineState
    private let ambientPipe: MTLRenderPipelineState
    private let edgesPipe: MTLRenderPipelineState
    private let downPipe: MTLRenderPipelineState
    private let picturePipe: MTLRenderPipelineState
    private var src: MTLTexture?
    /** A 2x frame averaged back to the game's size. */
    private var nat: MTLTexture?
    /** What every style, the edges pass and the ambient light read: the frame, or nat. */
    private var work: MTLTexture?
    /** The game size work was made for (a new one redoes it without a new frame). */
    private var workNative: PictureLayout.Size?
    private let amb: MTLTexture
    private var pre: MTLTexture
    /** The ambient texture follows the frames (else the next ambient frame takes the picture at once). */
    private var ambientFresh = false
    /** The picture's rectangle in target pixels, from the last draw. */
    private(set) var rect = PictureLayout.Rect(x: 0, y: 0, w: 0, h: 0)
    var sourceSize: (w: Int, h: Int)? { src.map { ($0.width, $0.height) } }

    private static var libraries: [ObjectIdentifier: MTLLibrary] = [:]
    private static let libraryLock = NSLock()

    /** The compiled shaders, once per GPU. */
    private static func library(_ device: MTLDevice) throws -> MTLLibrary {
        libraryLock.lock()
        defer { libraryLock.unlock() }
        let key = ObjectIdentifier(device)
        if let lib = libraries[key] { return lib }
        let lib = try device.makeLibrary(source: PictureShaders.source, options: nil)
        libraries[key] = lib
        return lib
    }

    static func make(device: MTLDevice, targetFormat: MTLPixelFormat) -> PictureRenderer? {
        do {
            return try PictureRenderer(device: device, targetFormat: targetFormat)
        } catch {
            NSLog("picture renderer unavailable: %@", String(describing: error))
            return nil
        }
    }

    private struct SetupError: Error {
        let what: String
    }

    private init(device: MTLDevice, targetFormat: MTLPixelFormat) throws {
        self.device = device
        let lib = try Self.library(device)
        func pipe(_ fragment: String, _ format: MTLPixelFormat, blend: Bool = false) throws -> MTLRenderPipelineState {
            let d = MTLRenderPipelineDescriptor()
            d.vertexFunction = lib.makeFunction(name: "picture_vertex")
            d.fragmentFunction = lib.makeFunction(name: fragment)
            guard d.vertexFunction != nil, d.fragmentFunction != nil else { throw SetupError(what: fragment) }
            d.colorAttachments[0].pixelFormat = format
            if blend {
                let c = d.colorAttachments[0]!
                c.isBlendingEnabled = true
                c.rgbBlendOperation = .add
                c.alphaBlendOperation = .add
                c.sourceRGBBlendFactor = .sourceAlpha
                c.destinationRGBBlendFactor = .oneMinusSourceAlpha
                c.sourceAlphaBlendFactor = .one
                c.destinationAlphaBlendFactor = .zero
            }
            return try device.makeRenderPipelineState(descriptor: d)
        }
        yuvI420 = try pipe("yuv_i420", .rgba8Unorm)
        yuvNv12 = try pipe("yuv_nv12", .rgba8Unorm)
        ambientPipe = try pipe("ambient_fragment", .rgba8Unorm, blend: true)
        edgesPipe = try pipe("edges_fragment", .rgba8Unorm)
        downPipe = try pipe("down_fragment", .rgba8Unorm)
        picturePipe = try pipe("picture_fragment", targetFormat)
        guard let amb = Self.target(device, Self.ambientSize.w, Self.ambientSize.h),
              let pre = Self.target(device, 1, 1) else { throw SetupError(what: "textures") }
        self.amb = amb
        self.pre = pre
    }

    /** A texture the GPU draws into and then samples. */
    static func target(_ device: MTLDevice, _ w: Int, _ h: Int) -> MTLTexture? {
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: max(1, w), height: max(1, h), mipmapped: false)
        d.usage = [.renderTarget, .shaderRead]
        d.storageMode = .private
        return device.makeTexture(descriptor: d)
    }

    private func pass(_ cb: MTLCommandBuffer, into texture: MTLTexture, clear: Bool = false, _ encode: (MTLRenderCommandEncoder) -> Void) {
        let rp = MTLRenderPassDescriptor()
        rp.colorAttachments[0].texture = texture
        rp.colorAttachments[0].loadAction = clear ? .clear : .dontCare
        rp.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        rp.colorAttachments[0].storeAction = .store
        guard let enc = cb.makeRenderCommandEncoder(descriptor: rp) else { return }
        encode(enc)
        enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        enc.endEncoding()
    }

    private struct YuvUniforms {
        var size: SIMD2<Float>
        var full: Float
        var pad: Float = 0
    }

    private struct AmbientUniforms {
        var size: SIMD2<Float>
        var mix: Float
        var pad: Float = 0
    }

    private struct EdgesUniforms {
        var srcSize: SIMD2<Float>
        var outSize: SIMD2<Float>
    }

    /** Must match PictureUniforms in the shaders. */
    private struct PictureUniforms {
        var preSize: SIMD2<Float>
        var srcSize: SIMD2<Float>
        var ambSize: SIMD2<Float>
        var canvas: SIMD2<Float>
        var rect: SIMD4<Float>
        var rectRef: SIMD4<Float>
        var style: Float
        var bands: Float
        var split: Float
        var dpr: Float
        var black: SIMD4<Float>
        var cabinet: SIMD4<Float>
        var cabinet2: SIMD4<Float>
        var bezel: SIMD4<Float>
        var bezelHi: SIMD4<Float>
        var trim: SIMD4<Float>
        var bezelWidth: Float
        var pad0: Float = 0
        var pad1: Float = 0
        var pad2: Float = 0
    }

    /**
     * A new frame: its RGB texture, and the ambient light blended toward it
     * when the Ambient sides are on.
     */
    func encodeFrame(_ input: Input, width: Int, height: Int, options: Options, into cb: MTLCommandBuffer) {
        if src?.width != width || src?.height != height { src = Self.target(device, width, height) }
        guard let src else { return }
        if case let .rgba(t) = input {
            if let blit = cb.makeBlitCommandEncoder() {
                blit.copy(from: t, sourceSlice: 0, sourceLevel: 0, sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0),
                          sourceSize: MTLSize(width: min(width, t.width), height: min(height, t.height), depth: 1),
                          to: src, destinationSlice: 0, destinationLevel: 0, destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0))
                blit.endEncoding()
            }
        } else {
            var k = YuvUniforms(size: SIMD2(Float(width), Float(height)), full: 0)
            pass(cb, into: src) { enc in
                switch input {
                case let .i420(y, u, v, full):
                    k.full = full ? 1 : 0
                    enc.setRenderPipelineState(yuvI420)
                    enc.setFragmentTexture(y, index: 0)
                    enc.setFragmentTexture(u, index: 1)
                    enc.setFragmentTexture(v, index: 2)
                case let .nv12(y, cbcr, full):
                    k.full = full ? 1 : 0
                    enc.setRenderPipelineState(yuvNv12)
                    enc.setFragmentTexture(y, index: 0)
                    enc.setFragmentTexture(cbcr, index: 1)
                case .rgba:
                    break
                }
                enc.setFragmentBytes(&k, length: MemoryLayout<YuvUniforms>.stride, index: 0)
            }
        }
        prepareWork(native: options.native, cb: cb)
        guard let work, options.settings.bands == .ambient else {
            ambientFresh = false
            return
        }
        let mixAmount: Float = ambientFresh ? (options.reducedMotion ? 0.05 : 0.2) : 1
        var a = AmbientUniforms(size: SIMD2(Float(Self.ambientSize.w), Float(Self.ambientSize.h)), mix: mixAmount)
        let rp = MTLRenderPassDescriptor()
        rp.colorAttachments[0].texture = amb
        rp.colorAttachments[0].loadAction = ambientFresh ? .load : .clear
        rp.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        rp.colorAttachments[0].storeAction = .store
        if let enc = cb.makeRenderCommandEncoder(descriptor: rp) {
            enc.setRenderPipelineState(ambientPipe)
            enc.setFragmentTexture(work, index: 0)
            enc.setFragmentBytes(&a, length: MemoryLayout<AmbientUniforms>.stride, index: 0)
            enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
            enc.endEncoding()
        }
        ambientFresh = true
    }

    /**
     * The website's workingSize: a frame exactly twice the game's size is
     * averaged back to the game's size (down_fragment) and every later pass
     * reads that texture; any other frame is read as it is.
     */
    private func prepareWork(native: PictureLayout.Size?, cb: MTLCommandBuffer) {
        workNative = native
        guard let src else { return }
        let ws = PictureLayout.workingSize(frameW: src.width, frameH: src.height, native: native)
        guard ws.down else {
            work = src
            return
        }
        if nat?.width != ws.w || nat?.height != ws.h { nat = Self.target(device, ws.w, ws.h) }
        guard let nat else {
            work = src
            return
        }
        pass(cb, into: nat) { enc in
            enc.setRenderPipelineState(downPipe)
            enc.setFragmentTexture(src, index: 0)
        }
        work = nat
    }

    /**
     * Draws the last frame into the target (the screen's drawable). Returns
     * false when there is no frame yet.
     */
    @discardableResult
    func encodePicture(into target: MTLTexture, options: Options, cb: MTLCommandBuffer) -> Bool {
        if options.native != workNative || work == nil { prepareWork(native: options.native, cb: cb) }
        guard let src = work, target.width > 0, target.height > 0 else { return false }
        let w = Double(target.width)
        let h = Double(target.height)
        let aspect = options.aspect > 0 && options.aspect.isFinite ? options.aspect : Double(src.width) / Double(src.height)
        let ref = PictureLayout.fitRect(w, h, aspect: aspect)
        let inset = options.settings.bands == .frame ? PictureLayout.frameInset(w, h, scale: options.scale) : 0
        let rect = inset > 0 ? PictureLayout.fitRect(w, h, aspect: aspect, inset: inset) : ref
        self.rect = rect
        guard rect.w > 0, rect.h > 0 else { return false }

        // Smooth edges: the enlarged texture first (an integer per axis, at
        // least the final scale, so the last step only shrinks or keeps it).
        if options.settings.style == .edges {
            let pw = src.width * PictureLayout.prescale(rect.w, Double(src.width))
            let ph = src.height * PictureLayout.prescale(rect.h, Double(src.height))
            if pre.width != pw || pre.height != ph, let t = Self.target(device, pw, ph) { pre = t }
            var e = EdgesUniforms(srcSize: SIMD2(Float(src.width), Float(src.height)), outSize: SIMD2(Float(pre.width), Float(pre.height)))
            pass(cb, into: pre) { enc in
                enc.setRenderPipelineState(edgesPipe)
                enc.setFragmentTexture(src, index: 0)
                enc.setFragmentBytes(&e, length: MemoryLayout<EdgesUniforms>.stride, index: 0)
            }
        }

        let c = colors
        var u = PictureUniforms(
            preSize: SIMD2(Float(pre.width), Float(pre.height)),
            srcSize: SIMD2(Float(src.width), Float(src.height)),
            ambSize: SIMD2(Float(Self.ambientSize.w), Float(Self.ambientSize.h)),
            canvas: SIMD2(Float(w), Float(h)),
            rect: SIMD4(Float(rect.x), Float(rect.y), Float(rect.w), Float(rect.h)),
            rectRef: SIMD4(Float(ref.x), Float(ref.y), Float(ref.w), Float(ref.h)),
            style: options.settings.style.code,
            bands: options.settings.bands.code,
            split: options.split.map { Float(PictureLayout.clampSplit($0) * w) } ?? -1,
            dpr: Float(options.scale),
            black: c.black, cabinet: c.cabinet, cabinet2: c.cabinet2, bezel: c.bezel, bezelHi: c.bezelHi, trim: c.trim,
            bezelWidth: Float(inset)
        )
        pass(cb, into: target) { enc in
            enc.setRenderPipelineState(picturePipe)
            enc.setFragmentTexture(src, index: 0)
            enc.setFragmentTexture(amb, index: 1)
            enc.setFragmentTexture(pre, index: 2)
            enc.setFragmentBytes(&u, length: MemoryLayout<PictureUniforms>.stride, index: 0)
        }
        return true
    }
}

extension SIMD4 where Scalar == Float {
    /** 0xRRGGBB as 0-1 floats (alpha 1). */
    init(rgb: UInt32) {
        self.init(Float((rgb >> 16) & 255) / 255, Float((rgb >> 8) & 255) / 255, Float(rgb & 255) / 255, 1)
    }
}
