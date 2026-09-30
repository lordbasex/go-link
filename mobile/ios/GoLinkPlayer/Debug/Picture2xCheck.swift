// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

#if DEBUG
import GoLinkCore
import Metal
import SwiftUI
import UIKit

/**
 * Debug builds only (launch argument -picture2xCheck): proves the 2x
 * stream path offscreen, like the website's picture lab did in Chromium.
 * The test card (fixed time) is drawn twice with the real PictureRenderer
 * in every style and side: once at its own size (384 x 224) and once
 * enlarged 2x with nearest neighbour and marked as a 2x stream (native
 * 384 x 224). Both pictures must be byte for byte identical. The same 2x
 * frame drawn raw (no native size) must differ (CRT would draw twice the
 * game's scanlines), which shows the check really runs through the
 * average. "picture-2x-check" says "ok" or what failed.
 */
enum Picture2xCheck {
    struct Result {
        var identical = 0
        var total = 0
        var rawDiffers = 0
        var failures: [String] = []
        /** CRT arcade with the ambient sides: native, 2x averaged, 2x raw (for the screenshot). */
        var images: [UIImage] = []

        var ok: Bool { total > 0 && identical == total && failures.isEmpty }
        var summary: String {
            (ok ? "ok" : "failed") + " \(identical)/\(total) identical, raw 2x differs in \(rawDiffers)/\(total)"
                + (failures.isEmpty ? "" : " · " + failures.prefix(4).joined(separator: ", "))
        }
    }

    static let targets = [(w: 1170, h: 878), (w: 844, h: 390)]

    static func run() -> Result {
        var r = Result()
        guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue() else {
            r.failures.append("no Metal")
            return r
        }
        let w = PictureTestCard.width, h = PictureTestCard.height
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let card = PictureTestCard.rgba(t: 1.25, now: now)
        var up = [UInt8](repeating: 0, count: w * h * 16)
        for y in 0..<(h * 2) {
            for x in 0..<(w * 2) {
                let s = ((y / 2) * w + x / 2) * 4
                let d = (y * w * 2 + x) * 4
                up[d] = card[s]; up[d + 1] = card[s + 1]; up[d + 2] = card[s + 2]; up[d + 3] = 255
            }
        }
        guard let nativeTex = texture(device, card, w, h), let upTex = texture(device, up, w * 2, h * 2) else {
            r.failures.append("textures")
            return r
        }
        let native = PictureLayout.Size(w: w, h: h)
        for t in targets {
            for style in PictureStyle.allCases {
                for bands in PictureBands.allCases {
                    let settings = PictureSettings(style: style, bands: bands)
                    let a = draw(device, queue, nativeTex, w, h, settings, t, native: nil)
                    let b = draw(device, queue, upTex, w * 2, h * 2, settings, t, native: native)
                    let raw = draw(device, queue, upTex, w * 2, h * 2, settings, t, native: nil)
                    let name = "\(style.rawValue)/\(bands.rawValue)@\(t.w)x\(t.h)"
                    r.total += 1
                    guard let a, let b, let raw else {
                        r.failures.append("\(name) not drawn")
                        continue
                    }
                    if a == b { r.identical += 1 } else { r.failures.append("\(name) \(differing(a, b)) px differ") }
                    if a != raw { r.rawDiffers += 1 }
                    if t == targets[0], style == .crt, bands == .ambient {
                        r.images = [a, b, raw].compactMap { image($0, t.w, t.h) }
                    }
                }
            }
        }
        NSLog("picture 2x check: %@", r.summary)
        return r
    }

    private static func texture(_ device: MTLDevice, _ rgba: [UInt8], _ w: Int, _ h: Int) -> MTLTexture? {
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: w, height: h, mipmapped: false)
        d.usage = .shaderRead
        d.storageMode = .shared
        guard let t = device.makeTexture(descriptor: d) else { return nil }
        rgba.withUnsafeBytes { t.replace(region: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0, withBytes: $0.baseAddress!, bytesPerRow: w * 4) }
        return t
    }

    /** One still picture with a fresh renderer (the ambient light starts from this frame), read back as BGRA bytes. */
    private static func draw(_ device: MTLDevice, _ queue: MTLCommandQueue, _ frame: MTLTexture, _ fw: Int, _ fh: Int,
                             _ settings: PictureSettings, _ t: (w: Int, h: Int), native: PictureLayout.Size?) -> [UInt8]? {
        guard let renderer = PictureRenderer.make(device: device, targetFormat: .bgra8Unorm) else { return nil }
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: t.w, height: t.h, mipmapped: false)
        d.usage = [.renderTarget, .shaderRead]
        d.storageMode = .private
        guard let target = device.makeTexture(descriptor: d),
              let out = device.makeBuffer(length: t.w * t.h * 4, options: .storageModeShared),
              let cb = queue.makeCommandBuffer() else { return nil }
        let o = PictureRenderer.Options(settings: settings, split: nil, aspect: PictureTestCard.aspect, scale: 3, native: native)
        renderer.encodeFrame(.rgba(frame), width: fw, height: fh, options: o, into: cb)
        guard renderer.encodePicture(into: target, options: o, cb: cb), let blit = cb.makeBlitCommandEncoder() else { return nil }
        blit.copy(from: target, sourceSlice: 0, sourceLevel: 0, sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0), sourceSize: MTLSize(width: t.w, height: t.h, depth: 1),
                  to: out, destinationOffset: 0, destinationBytesPerRow: t.w * 4, destinationBytesPerImage: t.w * t.h * 4)
        blit.endEncoding()
        cb.commit()
        cb.waitUntilCompleted()
        return [UInt8](UnsafeRawBufferPointer(start: out.contents(), count: out.length))
    }

    private static func differing(_ a: [UInt8], _ b: [UInt8]) -> Int {
        var n = 0
        var i = 0
        while i < min(a.count, b.count) {
            if a[i] != b[i] || a[i + 1] != b[i + 1] || a[i + 2] != b[i + 2] { n += 1 }
            i += 4
        }
        return n
    }

    private static func image(_ bgra: [UInt8], _ w: Int, _ h: Int) -> UIImage? {
        var bytes = bgra
        return bytes.withUnsafeMutableBytes { raw -> UIImage? in
            guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
                  let cg = ctx.makeImage() else { return nil }
            return UIImage(cgImage: cg)
        }
    }
}

/** The check's result and its three CRT pictures (native, 2x averaged, 2x raw). */
struct Picture2xCheckView: View {
    @State private var result: Picture2xCheck.Result?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(result?.summary ?? "running…")
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(result.map { $0.ok ? Tokens.voice : Tokens.dangerText } ?? Tokens.muted)
                    .accessibilityIdentifier("picture-2x-check")
                if let result {
                    ForEach(Array(zip(["native 384×224", "2× averaged", "2× raw"], result.images)), id: \.0) { label, img in
                        Text(label).font(.caption).foregroundStyle(Tokens.muted)
                        Image(uiImage: img).resizable().interpolation(.none).aspectRatio(contentMode: .fit)
                    }
                }
            }
            .padding(16)
        }
        .background(Tokens.bg.ignoresSafeArea())
        .onAppear {
            // After the first frame, so "running…" shows while the GPU works.
            DispatchQueue.main.async { result = Picture2xCheck.run() }
        }
    }
}
#endif
