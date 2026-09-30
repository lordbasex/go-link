// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The picture's shaders in the Metal Shading Language: a line by line port
// of the website's GLSL (frontend/apps/web/src/picture/shaders.ts), with
// the same math, so every style looks the same in the app and the browser.
// Keep both in sync.
//
// Coordinates: "p" is a drawable pixel with the origin at the top left
// (Metal's [[position]] already is); "uv" is the game's picture from 0 to 1
// with row 0 at the top, like the website's textures (no flip anywhere).
//
// Styles (style): 0 smooth, 1 sharp, 2 CRT arcade, 3 smooth edges.
// Sides (bands): 0 black, 1 ambient, 2 frame.
//
// The source is compiled when the app first draws a picture
// (MTLDevice.makeLibrary(source:)), so building the app needs no Metal
// toolchain; a compile error only means the plain picture (fallback).

enum PictureShaders {
    static let source = #"""
#include <metal_stdlib>
using namespace metal;

struct VertexOut {
    float4 position [[position]];
};

/** One triangle that covers the whole target. */
vertex VertexOut picture_vertex(uint vid [[vertex_id]]) {
    const float2 corners[3] = { float2(-1.0, -1.0), float2(3.0, -1.0), float2(-1.0, 3.0) };
    VertexOut out;
    out.position = float4(corners[vid], 0.0, 1.0);
    return out;
}

constexpr sampler linearClamp(filter::linear, address::clamp_to_edge);

/** GLSL's mod (the result has the divisor's sign), unlike fmod. */
static inline float glmod(float x, float y) { return x - y * floor(x / y); }
static inline float2 glmod(float2 x, float y) { return x - y * floor(x / y); }

// MARK: YUV to RGB

/**
 * The decoded frame to RGB, BT.601 (what VP8 carries and browsers use).
 * Limited range: Y 16-235, chroma 16-240; full range: 0-255.
 */
static inline float3 bt601(float y, float u, float v, float full) {
    float yy = full > 0.5 ? y : (y - 16.0 / 255.0) * (255.0 / 219.0);
    float cs = full > 0.5 ? 1.0 : 255.0 / 224.0;
    float cb = (u - 0.5) * cs;
    float cr = (v - 0.5) * cs;
    float3 rgb = float3(yy + 1.402 * cr, yy - 0.344136 * cb - 0.714136 * cr, yy + 1.772 * cb);
    return clamp(rgb, 0.0, 1.0);
}

struct YuvUniforms {
    float2 size;
    float full;
    float pad;
};

fragment float4 yuv_i420(VertexOut in [[stage_in]],
                         texture2d<float> y [[texture(0)]],
                         texture2d<float> u [[texture(1)]],
                         texture2d<float> v [[texture(2)]],
                         constant YuvUniforms &k [[buffer(0)]]) {
    float2 uv = in.position.xy / k.size;
    return float4(bt601(y.sample(linearClamp, uv).r, u.sample(linearClamp, uv).r, v.sample(linearClamp, uv).r, k.full), 1.0);
}

fragment float4 yuv_nv12(VertexOut in [[stage_in]],
                         texture2d<float> y [[texture(0)]],
                         texture2d<float> cbcr [[texture(1)]],
                         constant YuvUniforms &k [[buffer(0)]]) {
    float2 uv = in.position.xy / k.size;
    float2 c = cbcr.sample(linearClamp, uv).rg;
    return float4(bt601(y.sample(linearClamp, uv).r, c.x, c.y, k.full), 1.0);
}

// MARK: 2x streams

/**
 * The website's DOWN_SHADER: a 2x stream (every game pixel sent as a 2 x 2
 * block) back to the game's own size, each texel the average of its
 * block's four frame texels (read exactly, no filtering). Row t of this
 * texture is rows 2t and 2t + 1 of the frame (no flip).
 */
fragment float4 down_fragment(VertexOut in [[stage_in]],
                              texture2d<float> src [[texture(0)]]) {
    uint2 base = uint2(floor(in.position.xy)) * 2;
    float3 sum = src.read(base).rgb
        + src.read(base + uint2(1, 0)).rgb
        + src.read(base + uint2(0, 1)).rgb
        + src.read(base + uint2(1, 1)).rgb;
    return float4(sum * 0.25, 1.0);
}

// MARK: Ambient

struct AmbientUniforms {
    float2 size;
    float mixAmount;
    float pad;
};

/**
 * Shrinks the frame to the tiny ambient texture: each texel averages a
 * 4 x 4 grid of bilinear samples over its footprint. Blended over the last
 * frame's texture (the pipeline blends with alpha), so the colors glide.
 */
fragment float4 ambient_fragment(VertexOut in [[stage_in]],
                                 texture2d<float> src [[texture(0)]],
                                 constant AmbientUniforms &k [[buffer(0)]]) {
    float2 uv = in.position.xy / k.size;
    float2 texel = 1.0 / k.size;
    float3 sum = float3(0.0);
    for (int j = 0; j < 4; j++) {
        for (int i = 0; i < 4; i++) {
            float2 o = (float2(float(i), float(j)) - 1.5) * 0.25 * texel;
            sum += src.sample(linearClamp, clamp(uv + o, 0.0, 1.0)).rgb;
        }
    }
    return float4(sum / 16.0, k.mixAmount);
}

// MARK: Smooth edges

struct EdgesUniforms {
    float2 srcSize;
    float2 outSize;
};

static inline float3 edgesAt(texture2d<float> src, float2 texel, float2 srcSize) {
    return src.sample(linearClamp, (clamp(texel, float2(0.0), srcSize - 1.0) + 0.5) / srcSize).rgb;
}

/** Colors are "the same" when close in a luma-weighted distance. */
static inline bool same(float3 a, float3 b) {
    float3 d = a - b;
    float y = dot(d, float3(0.299, 0.587, 0.114));
    float u = d.b - y;
    float v = d.r - y;
    return (48.0 * abs(y) + 7.0 * abs(u) + 6.0 * abs(v)) < 1.2;
}

/** The website's EDGES_SHADER: an integer enlargement that cuts staircase corners along their diagonal. */
fragment float4 edges_fragment(VertexOut in [[stage_in]],
                               texture2d<float> src [[texture(0)]],
                               constant EdgesUniforms &k [[buffer(0)]]) {
    float2 pos = in.position.xy / k.outSize * k.srcSize;
    float2 texel = floor(pos);
    float2 f = pos - texel - 0.5;
    float2 dir = float2(f.x < 0.0 ? -1.0 : 1.0, f.y < 0.0 ? -1.0 : 1.0);
    float3 c = edgesAt(src, texel, k.srcSize);
    float3 side = edgesAt(src, texel + float2(dir.x, 0.0), k.srcSize);
    float3 vert = edgesAt(src, texel + float2(0.0, dir.y), k.srcSize);
    float3 back = edgesAt(src, texel - float2(dir.x, 0.0), k.srcSize);
    float3 down = edgesAt(src, texel - float2(0.0, dir.y), k.srcSize);
    float3 col = c;
    if (same(side, vert) && !same(c, side) && !same(side, back) && !same(vert, down)) {
        float2 q = abs(f) * 2.0;
        float2 scale = k.outSize / k.srcSize;
        float past = (q.x + q.y - 1.0) * 0.5 * min(scale.x, scale.y);
        col = mix(c, side, clamp(past + 0.5, 0.0, 1.0));
    }
    return float4(col, 1.0);
}

// MARK: The picture

/** Must match PictureUniforms in PictureRenderer.swift (colors as float4 for the alignment). */
struct PictureUniforms {
    float2 preSize;
    float2 srcSize;
    float2 ambSize;
    float2 canvas;
    float4 rect;
    float4 rectRef;
    float style;
    float bands;
    float split;
    float dpr;
    float4 black;
    float4 cabinet;
    float4 cabinet2;
    float4 bezel;
    float4 bezelHi;
    float4 trim;
    float bezelWidth;
    float pad0;
    float pad1;
    float pad2;
};

struct Textures {
    texture2d<float> src;
    texture2d<float> amb;
    texture2d<float> pre;
};

static inline float3 toLinear(float3 c) { return pow(max(c, float3(0.0)), float3(2.2)); }
static inline float3 toGamma(float3 c) { return pow(max(c, float3(0.0)), float3(1.0 / 2.2)); }

static inline float hash(float2 p) {
    return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
}

/** Signed distance to a rounded box (half size b, corner radius r). */
static inline float roundBox(float2 p, float2 b, float r) {
    float2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

static inline float3 smoothPixel(thread const Textures &t, float2 uv) {
    return t.src.sample(linearClamp, uv).rgb;
}

/** Sharp: flat inside a game pixel, a one screen pixel blend across each edge. */
static inline float3 sharpPixel(thread const Textures &t, constant PictureUniforms &u, float2 uv, float2 scale) {
    float2 tt = uv * u.srcSize - 0.5;
    float2 i = floor(tt);
    float2 f = clamp((tt - i - 0.5) * scale + 0.5, 0.0, 1.0);
    return t.src.sample(linearClamp, (i + f + 0.5) / u.srcSize).rgb;
}

/** The same thin blend over the enlarged smooth edges texture. */
static inline float3 edgesPixel(thread const Textures &t, constant PictureUniforms &u, float2 uv, float2 scale) {
    float2 tt = uv * u.preSize - 0.5;
    float2 i = floor(tt);
    float2 f = clamp((tt - i - 0.5) * max(scale, float2(1.0)) + 0.5, 0.0, 1.0);
    return t.pre.sample(linearClamp, (i + f + 0.5) / u.preSize).rgb;
}

/** One scanline of the tube: sharp across x, at the center of row "row". */
static inline float3 crtRow(thread const Textures &t, constant PictureUniforms &u, float x, float row, float sx) {
    float tt = x - 0.5;
    float i = floor(tt);
    float f = clamp((tt - i - 0.5) * sx * 0.5 + 0.5, 0.0, 1.0);
    float r = clamp(row, 0.0, u.srcSize.y - 1.0);
    return toLinear(t.src.sample(linearClamp, float2((i + f + 0.5) / u.srcSize.x, (r + 0.5) / u.srcSize.y)).rgb);
}

/** The beam's profile: brighter colors light a wider line. */
static inline float3 beam(float d, float3 c) {
    float3 w = mix(float3(0.22), float3(0.36), sqrt(clamp(c, 0.0, 1.0)));
    return exp(-0.5 * d * d / (w * w));
}

/** The CRT arcade style (see the website's shaders.ts for the design notes). */
static inline float3 crtPixel(thread const Textures &t, constant PictureUniforms &u, float2 p, float4 rect, float fragX, thread float &inside) {
    float2 c = (p - rect.xy) / rect.zw * 2.0 - 1.0;
    float k = 0.045;
    float2 cc = c * (1.0 + k * dot(c, c)) / (1.0 + k);
    float2 uv = cc * 0.5 + 0.5;
    float2 edge = (0.5 - abs(uv - 0.5)) * rect.zw;
    inside = clamp(min(edge.x, edge.y) + 0.5, 0.0, 1.0);
    float2 pos = uv * u.srcSize;
    float2 scale = rect.zw / u.srcSize;
    float y = pos.y - 0.5;
    float row = floor(y);
    float dy = y - row;
    float3 a = crtRow(t, u, pos.x, row, scale.x);
    float3 b = crtRow(t, u, pos.x, row + 1.0, scale.x);
    float3 lines = a * beam(dy, a) + b * beam(1.0 - dy, b);
    float strength = smoothstep(1.8, 3.2, scale.y);
    float3 plain = mix(a, b, smoothstep(0.0, 1.0, dy));
    float3 col = mix(plain, lines * 1.35, strength);
    float2 o = 1.6 / u.srcSize;
    float3 glow = toLinear(t.src.sample(linearClamp, uv + float2(o.x, o.y)).rgb)
        + toLinear(t.src.sample(linearClamp, uv + float2(-o.x, o.y)).rgb)
        + toLinear(t.src.sample(linearClamp, uv + float2(o.x, -o.y)).rgb)
        + toLinear(t.src.sample(linearClamp, uv + float2(-o.x, -o.y)).rgb);
    float column = glmod(floor(fragX), 3.0);
    float dark = mix(1.0, 0.68, strength);
    float3 mask = float3(dark);
    if (column < 0.5) mask.r = 1.0;
    else if (column < 1.5) mask.g = 1.0;
    else mask.b = 1.0;
    col = col * mask * mix(1.0, 1.28, strength) + glow * glow * 0.012;
    col *= 1.0 - 0.18 * pow(dot(c, c) * 0.5, 2.0);
    return toGamma(col);
}

/** Ambient: the frame, blurred and enlarged to cover the stage, darkened. */
static inline float3 ambient(thread const Textures &t, constant PictureUniforms &u, float2 p, float4 rect) {
    float2 center = rect.xy + rect.zw * 0.5;
    float cover = max(u.canvas.x / rect.z, u.canvas.y / rect.w) * 1.12;
    float2 uv = (p - center) / (rect.zw * cover) + 0.5;
    float2 o = 1.5 / u.ambSize;
    float3 sum = t.amb.sample(linearClamp, uv).rgb * 4.0;
    for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        float2 d = float2(cos(a), sin(a));
        sum += t.amb.sample(linearClamp, uv + d * o).rgb;
        sum += t.amb.sample(linearClamp, uv + d * o * 2.2).rgb * 0.5;
    }
    float3 c = sum / 16.0;
    float2 d = max(abs(p - center) - rect.zw * 0.5, 0.0) / max(u.canvas.x, u.canvas.y);
    float fade = 1.0 - smoothstep(0.0, 0.45, length(d));
    c *= 0.36 + 0.26 * fade;
    return c + (hash(p) - 0.5) / 255.0;
}

/** Frame: an arcade cabinet around the monitor (bezel, panel, lit trim, speaker grilles). */
static inline float3 cabinet(constant PictureUniforms &u, float2 p, float4 rect) {
    float s = u.dpr;
    float2 center = rect.xy + rect.zw * 0.5;
    float v = p.y / u.canvas.y;
    float3 col = mix(u.cabinet2.rgb, u.cabinet.rgb, smoothstep(0.0, 1.0, v));
    col += u.cabinet2.rgb * 0.35 * (1.0 - smoothstep(0.0, 0.7, abs(p.x / u.canvas.x - 0.5) * 2.0)) * (1.0 - v);
    float band = rect.x;
    if (band > 70.0 * s) {
        float gx = p.x < center.x ? band * 0.5 : u.canvas.x - band * 0.5;
        float2 g = float2(gx, u.canvas.y * 0.72);
        float radius = min(band * 0.3, u.canvas.y * 0.13);
        float pitch = 7.0 * s;
        float2 cell = glmod(p - g, pitch) - pitch * 0.5;
        float hole = 1.0 - smoothstep(1.2 * s, 2.0 * s, length(cell));
        float inGrille = 1.0 - smoothstep(radius - s, radius, length(p - g));
        col = mix(col, col * 0.35, hole * inGrille);
        float ring = abs(length(p - g) - radius - 3.0 * s);
        col += u.bezelHi.rgb * 0.18 * (1.0 - smoothstep(0.0, 1.5 * s, ring));
    }
    float trim = min(p.x, u.canvas.x - p.x);
    col = mix(col, u.trim.rgb, (1.0 - smoothstep(3.0 * s, 4.0 * s, trim)) * 0.85);
    col += u.trim.rgb * 0.12 * (1.0 - smoothstep(4.0 * s, 26.0 * s, trim));
    float width = u.bezelWidth;
    float d = roundBox(p - center, rect.zw * 0.5 + width, 10.0 * s + width * 0.5);
    if (d < 0.0) {
        float t = clamp(-d / width, 0.0, 1.0);
        float top = clamp((p.y - (rect.y - width)) / (rect.w + 2.0 * width), 0.0, 1.0);
        float3 b = mix(u.bezelHi.rgb, u.bezel.rgb, smoothstep(0.0, 0.35, top));
        b += u.bezelHi.rgb * 0.25 * (1.0 - smoothstep(0.0, 2.0 * s, -d));
        b *= mix(1.0, 0.55, smoothstep(0.6, 1.0, t));
        col = mix(b, col, clamp(d + 1.0, 0.0, 1.0));
    } else {
        col *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 18.0 * s, d));
    }
    return col + (hash(p) - 0.5) / 255.0;
}

static inline float3 bandColor(thread const Textures &t, constant PictureUniforms &u, float2 p, float4 rect, float bands) {
    if (bands > 1.5) return cabinet(u, p, rect);
    if (bands > 0.5) return ambient(t, u, p, rect);
    return u.black.rgb;
}

fragment float4 picture_fragment(VertexOut in [[stage_in]],
                                 texture2d<float> src [[texture(0)]],
                                 texture2d<float> amb [[texture(1)]],
                                 texture2d<float> pre [[texture(2)]],
                                 constant PictureUniforms &u [[buffer(0)]]) {
    Textures t = { src, amb, pre };
    float2 p = in.position.xy;
    bool reference = u.split >= 0.0 && p.x < u.split;
    float4 rect = reference ? u.rectRef : u.rect;
    float style = reference ? 0.0 : u.style;
    float bands = reference ? 0.0 : u.bands;
    float2 inRect = (p - rect.xy) / rect.zw;
    bool within = inRect.x >= 0.0 && inRect.y >= 0.0 && inRect.x <= 1.0 && inRect.y <= 1.0;
    float3 col;
    if (style > 2.5) {
        col = within ? edgesPixel(t, u, inRect, rect.zw / u.preSize) : bandColor(t, u, p, rect, bands);
    } else if (style > 1.5) {
        float2 center = rect.xy + rect.zw * 0.5;
        float radius = min(rect.z, rect.w) * 0.05;
        float glass = clamp(0.5 - roundBox(p - center, rect.zw * 0.5, radius), 0.0, 1.0);
        float3 outside = bandColor(t, u, p, rect, bands);
        if (glass <= 0.0) {
            col = outside;
        } else {
            float lit;
            float3 tube = crtPixel(t, u, p, rect, in.position.x, lit);
            col = mix(outside, mix(u.black.rgb, tube, lit), glass);
        }
    } else if (within) {
        col = style > 0.5 ? sharpPixel(t, u, inRect, rect.zw / u.srcSize) : smoothPixel(t, inRect);
    } else {
        col = bandColor(t, u, p, rect, bands);
    }
    return float4(col, 1.0);
}
"""#
}
