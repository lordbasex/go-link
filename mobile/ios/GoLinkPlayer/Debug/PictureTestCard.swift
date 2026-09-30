// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

#if DEBUG
import CoreGraphics
import Foundation

/**
 * Debug builds only: the website's synthetic arcade frame (testCard.ts),
 * drawn with Core Graphics at a game's native size: a PM5544-style card
 * (grid, color bars, gray steps, 1-4 pixel gratings, diagonals, a circle,
 * a pixel-font clock) plus moving sprites, so every picture style can be
 * judged without a room.
 */
enum PictureTestCard {
    static let width = 384
    static let height = 224
    /** Arcade monitors are 4:3, whatever the game's pixel grid is. */
    static let aspect = 4.0 / 3.0

    private static let bars: [UInt32] = [0xC0C0C0, 0xC0C000, 0x00C0C0, 0x00C000, 0xC000C0, 0xC00000, 0x0000C0]

    /** A 3x5 pixel font: digits, a colon and a few letters. */
    private static let glyphs: [Character: String] = [
        "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
        "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010",
        "8": "111101111101111", "9": "111101111001111", ":": "000010000010000", "x": "000101010101000",
        "G": "111100101101111", "O": "111101101101111", "L": "100100100100111", "I": "111010010010111",
        "N": "101111111101101", "K": "101101110101101", "-": "000000111000000", " ": "000000000000000",
    ]

    private static let ship = [
        "....aa....",
        "...abba...",
        "..abbbba..",
        ".aabccbaa.",
        "aabbccbbaa",
        "a.bbbbbb.a",
        "..d....d..",
    ]
    private static let coin = [
        "..eeee..",
        ".efffee.",
        "effeefe.",
        "efeffee.",
        "effeefe.",
        ".efffee.",
        "..eeee..",
    ]
    private static let spriteColors: [Character: UInt32] = [
        "a": 0x4FC3D9, "b": 0xE9ECF2, "c": 0xE0627A, "d": 0xF2A33A, "e": 0xB87A14, "f": 0xFFD76B,
    ]

    /**
     * Draws the card at time t (seconds) into a width x height context
     * whose origin is the top left (the caller flips a bitmap context).
     */
    static func draw(_ ctx: CGContext, t: Double, now: Date = Date()) {
        let W = CGFloat(width), H = CGFloat(height)
        func fill(_ rgb: UInt32, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) {
            ctx.setFillColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1)
            ctx.fill(CGRect(x: x, y: y, width: w, height: h))
        }
        ctx.setShouldAntialias(false)
        fill(0x6A6A6A, 0, 0, W, H)
        var x: CGFloat = 0
        while x <= W { fill(0xE8E8E8, x, 0, 1, H); x += 16 }
        var y: CGFloat = 0
        while y <= H { fill(0xE8E8E8, 0, y, W, 1); y += 16 }
        let bx: CGFloat = 64, by: CGFloat = 32, bw = W - 128, bh = H - 64
        fill(0x000000, bx, by, bw, bh)
        let barW = (bw / CGFloat(bars.count)).rounded(.down)
        for (i, c) in bars.enumerated() { fill(c, bx + CGFloat(i) * barW, by + 24, barW, 44) }
        for i in 0..<8 {
            let v = UInt32((Double(i) / 7 * 255).rounded())
            fill(v << 16 | v << 8 | v, bx + CGFloat(i) * (bw / 8), by + 70, (bw / 8).rounded(.up), 16)
        }
        let gy = by + 90
        for (k, step) in [1, 2, 3, 4].enumerated() {
            let gx = bx + 8 + CGFloat(k) * 62
            var sx = 0
            while sx < 56 { fill(0xFFFFFF, gx + CGFloat(sx), gy, CGFloat(step), 20); sx += step * 2 }
        }
        for i in 0..<40 {
            fill(0xFFFFFF, bx + 8 + CGFloat(i), gy + 24 + CGFloat(i / 2), 1, 1)
            fill(0xFFFFFF, bx + 60 + CGFloat(i), gy + 24 + CGFloat((40 - i) / 2), 1, 1)
        }
        let cx = bx + bw - 44, cy = gy + 34
        for a in stride(from: 0, to: 360, by: 2) {
            let r = Double(a) * .pi / 180
            fill(0xFFFFFF, (cx + cos(r) * 14).rounded(), (cy + sin(r) * 14).rounded(), 1, 1)
        }
        func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ px: CGFloat, _ color: UInt32) {
            var cx = x
            for ch in s {
                let g = Array(glyphs[ch] ?? glyphs[" "]!)
                for i in 0..<15 where g[i] == "1" {
                    fill(color, cx + CGFloat(i % 3) * px, y + CGFloat(i / 3) * px, px, px)
                }
                cx += 4 * px
            }
        }
        let parts = Calendar.current.dateComponents([.hour, .minute, .second], from: now)
        let clock = String(format: "%02d:%02d:%02d", parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0)
        text(clock, bx + 100, by + 6, 3, 0xFFFFFF)
        text("\(width)x\(height)", bx + 110, by + bh - 34, 2, 0xC4CAD6)
        text("GO-LINK", bx + 100, by + bh - 20, 3, 0xF2A33A)
        func sprite(_ rows: [String], _ x: Double, _ y: Double) {
            for (j, row) in rows.enumerated() {
                for (i, ch) in row.enumerated() {
                    guard let c = spriteColors[ch] else { continue }
                    fill(c, CGFloat(x.rounded()) + CGFloat(i), CGFloat(y.rounded()) + CGFloat(j), 1, 1)
                }
            }
        }
        let shipX = (t * 60).truncatingRemainder(dividingBy: Double(W) + 20) - 10
        sprite(ship, shipX, Double(H) - 22)
        let coinX = 20 + abs((t * 45).truncatingRemainder(dividingBy: 80) - 40)
        let coinY = 8 + abs(sin(t * 3)) * 12
        sprite(coin, coinX, coinY)
        sprite(coin, Double(W) - 30 - coinX, coinY)
    }

    /** The card as RGBA bytes, rows top to bottom. */
    static func rgba(t: Double, now: Date = Date()) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        bytes.withUnsafeMutableBytes { raw in
            guard let ctx = CGContext(data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return }
            // A bitmap context's origin is the bottom left: flip it so rows go top to bottom.
            ctx.translateBy(x: 0, y: CGFloat(height))
            ctx.scaleBy(x: 1, y: -1)
            draw(ctx, t: t, now: now)
        }
        return bytes
    }

    /** RGBA to I420 planes, BT.601 limited range (what a VP8 decoder hands over). */
    static func i420(_ rgba: [UInt8], width w: Int, height h: Int) -> (y: [UInt8], u: [UInt8], v: [UInt8]) {
        let cw = (w + 1) / 2, ch = (h + 1) / 2
        var yp = [UInt8](repeating: 0, count: w * h)
        var up = [UInt8](repeating: 128, count: cw * ch)
        var vp = [UInt8](repeating: 128, count: cw * ch)
        func clamp8(_ v: Double) -> UInt8 { UInt8(max(0, min(255, v.rounded()))) }
        for j in 0..<h {
            for i in 0..<w {
                let o = (j * w + i) * 4
                let r = Double(rgba[o]), g = Double(rgba[o + 1]), b = Double(rgba[o + 2])
                yp[j * w + i] = clamp8(16 + (65.481 * r + 128.553 * g + 24.966 * b) / 255)
            }
        }
        for j in 0..<ch {
            for i in 0..<cw {
                var r = 0.0, g = 0.0, b = 0.0, n = 0.0
                for dy in 0..<2 {
                    for dx in 0..<2 {
                        let x = min(w - 1, i * 2 + dx), y = min(h - 1, j * 2 + dy)
                        let o = (y * w + x) * 4
                        r += Double(rgba[o]); g += Double(rgba[o + 1]); b += Double(rgba[o + 2]); n += 1
                    }
                }
                r /= n; g /= n; b /= n
                up[j * cw + i] = clamp8(128 + (-37.797 * r - 74.203 * g + 112.0 * b) / 255)
                vp[j * cw + i] = clamp8(128 + (112.0 * r - 93.786 * g - 18.214 * b) / 255)
            }
        }
        return (yp, up, vp)
    }
}
#endif
