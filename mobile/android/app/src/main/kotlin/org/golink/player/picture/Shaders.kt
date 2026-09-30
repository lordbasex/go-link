// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.picture

/**
 * The website's picture shaders (frontend/apps/web/src/picture/shaders.ts),
 * copied as they are: GLSL ES 1.00 runs on OpenGL ES 2 unchanged, so the
 * app draws exactly what the website draws. Keep them in sync.
 *
 * Styles (u_style): 0 smooth, 1 sharp, 2 CRT arcade, 3 smooth edges.
 * Sides (u_bands): 0 black, 1 ambient, 2 frame.
 */
internal object Shaders {
    const val VERTEX_SHADER = """
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
"""

    /**
     * A 2x stream (every game pixel sent as a 2 x 2 block) back to the
     * game's own size: each texel is the average of its block's four frame
     * texels, taken as one bilinear sample at the block's center (the
     * second form docs/protocol.md allows; the website's DOWN_SHADER takes
     * four samples at texel centers). Both give the same average, but here
     * the filter only ever mixes texels of the same block, so a GPU whose
     * coordinates land a hair off a texel center (the Android emulator's
     * does) still gives exact colors.
     */
    const val DOWN_SHADER = """
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_src;
uniform vec2 u_srcSize;
void main() {
  // Row t of this texture is rows 2t and 2t + 1 of the frame (no flip).
  vec2 center = floor(gl_FragCoord.xy) * 2.0 + 1.0;
  gl_FragColor = vec4(texture2D(u_src, center / u_srcSize).rgb, 1.0);
}
"""

    const val AMBIENT_SHADER = """
precision mediump float;
uniform sampler2D u_src;
uniform vec2 u_size;
uniform float u_mix;
void main() {
  // Row t of a texture drawn here is row t of the frame (no flip).
  vec2 uv = gl_FragCoord.xy / u_size;
  vec2 texel = 1.0 / u_size;
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = (vec2(float(i), float(j)) - 1.5) * 0.25 * texel;
      sum += texture2D(u_src, clamp(uv + o, 0.0, 1.0)).rgb;
    }
  }
  gl_FragColor = vec4(sum / 16.0, u_mix);
}
"""

    const val PICTURE_SHADER = """
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_src;
uniform sampler2D u_amb;
uniform sampler2D u_pre;
uniform vec2 u_preSize;
uniform vec2 u_srcSize;
uniform vec2 u_ambSize;
uniform vec2 u_canvas;
uniform vec4 u_rect;
uniform vec4 u_rectRef;
uniform float u_style;
uniform float u_bands;
uniform float u_split;
uniform float u_dpr;
uniform vec3 u_black;
uniform vec3 u_cabinet;
uniform vec3 u_cabinet2;
uniform vec3 u_bezel;
uniform vec3 u_bezelHi;
uniform vec3 u_trim;
uniform float u_bezelWidth;

vec3 toLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 toGamma(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

/* Signed distance to a rounded box (half size b, corner radius r). */
float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 smoothPixel(vec2 uv) {
  return texture2D(u_src, uv).rgb;
}

/*
 * Sharp: inside a game pixel the color is flat (nearest), and across each
 * edge between two pixels it blends over one screen pixel (bilinear in a
 * thin band), so the pixels stay square at any scale without shimmering.
 */
vec3 sharpPixel(vec2 uv, vec2 scale) {
  vec2 t = uv * u_srcSize - 0.5;
  vec2 i = floor(t);
  vec2 f = clamp((t - i - 0.5) * scale + 0.5, 0.0, 1.0);
  return texture2D(u_src, (i + f + 0.5) / u_srcSize).rgb;
}

/* The same thin blend over the enlarged smooth edges texture. */
vec3 edgesPixel(vec2 uv, vec2 scale) {
  vec2 t = uv * u_preSize - 0.5;
  vec2 i = floor(t);
  vec2 f = clamp((t - i - 0.5) * max(scale, vec2(1.0)) + 0.5, 0.0, 1.0);
  return texture2D(u_pre, (i + f + 0.5) / u_preSize).rgb;
}

/* One scanline of the tube: sharp across x, at the center of row "row". */
vec3 crtRow(float x, float row, float sx) {
  float t = x - 0.5;
  float i = floor(t);
  float f = clamp((t - i - 0.5) * sx * 0.5 + 0.5, 0.0, 1.0);
  float r = clamp(row, 0.0, u_srcSize.y - 1.0);
  return toLinear(texture2D(u_src, vec2((i + f + 0.5) / u_srcSize.x, (r + 0.5) / u_srcSize.y)).rgb);
}

/* The beam's profile: brighter colors light a wider line. */
vec3 beam(float d, vec3 c) {
  vec3 w = mix(vec3(0.22), vec3(0.36), sqrt(clamp(c, 0.0, 1.0)));
  return exp(-0.5 * d * d / (w * w));
}

/*
 * The CRT arcade style, written for this site: the picture bulges a
 * little (the edges' midpoints stay, the corners come in, so nothing is
 * cut), each game line is a gaussian beam, an aperture grille splits every
 * screen pixel column into red, green and blue, and a soft glow spreads
 * the bright parts. Light is added in linear space.
 */
vec3 crtPixel(vec2 p, vec4 rect, out float inside) {
  vec2 c = (p - rect.xy) / rect.zw * 2.0 - 1.0;
  float k = 0.045;
  vec2 cc = c * (1.0 + k * dot(c, c)) / (1.0 + k);
  vec2 uv = cc * 0.5 + 0.5;
  // Soft edge of the lit area, one screen pixel wide.
  vec2 edge = (0.5 - abs(uv - 0.5)) * rect.zw;
  inside = clamp(min(edge.x, edge.y) + 0.5, 0.0, 1.0);
  vec2 pos = uv * u_srcSize;
  vec2 scale = rect.zw / u_srcSize;
  float y = pos.y - 0.5;
  float row = floor(y);
  float dy = y - row;
  vec3 a = crtRow(pos.x, row, scale.x);
  vec3 b = crtRow(pos.x, row + 1.0, scale.x);
  vec3 lines = a * beam(dy, a) + b * beam(1.0 - dy, b);
  // Fewer than about three screen pixels per game line cannot show lines
  // without moire: they fade to the plain picture.
  float strength = smoothstep(1.8, 3.2, scale.y);
  vec3 plain = mix(a, b, smoothstep(0.0, 1.0, dy));
  vec3 col = mix(plain, lines * 1.35, strength);
  // Glow: the neighborhood, blurred a little, added on top.
  vec2 o = 1.6 / u_srcSize;
  vec3 glow = toLinear(texture2D(u_src, uv + vec2(o.x, o.y)).rgb)
    + toLinear(texture2D(u_src, uv + vec2(-o.x, o.y)).rgb)
    + toLinear(texture2D(u_src, uv + vec2(o.x, -o.y)).rgb)
    + toLinear(texture2D(u_src, uv + vec2(-o.x, -o.y)).rgb);
  // Aperture grille at the screen's own pixel density.
  float column = mod(floor(gl_FragCoord.x), 3.0);
  float dark = mix(1.0, 0.68, strength);
  vec3 mask = vec3(dark);
  if (column < 0.5) mask.r = 1.0;
  else if (column < 1.5) mask.g = 1.0;
  else mask.b = 1.0;
  col = col * mask * mix(1.0, 1.28, strength) + glow * glow * 0.012;
  // A tube is a little darker toward its corners.
  col *= 1.0 - 0.18 * pow(dot(c, c) * 0.5, 2.0);
  return toGamma(col);
}

/* Ambient: the frame, blurred and enlarged to cover the stage, darkened. */
vec3 ambient(vec2 p, vec4 rect) {
  vec2 center = rect.xy + rect.zw * 0.5;
  float cover = max(u_canvas.x / rect.z, u_canvas.y / rect.w) * 1.12;
  vec2 uv = (p - center) / (rect.zw * cover) + 0.5;
  // Two rings of taps around the point: a wide, soft blur of a tiny texture.
  vec2 o = 1.5 / u_ambSize;
  vec3 sum = texture2D(u_amb, uv).rgb * 4.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 d = vec2(cos(a), sin(a));
    sum += texture2D(u_amb, uv + d * o).rgb;
    sum += texture2D(u_amb, uv + d * o * 2.2).rgb * 0.5;
  }
  vec3 c = sum / 16.0;
  // Darker away from the picture, like a light cast on a wall.
  vec2 d = max(abs(p - center) - rect.zw * 0.5, 0.0) / max(u_canvas.x, u_canvas.y);
  float fade = 1.0 - smoothstep(0.0, 0.45, length(d));
  c *= 0.36 + 0.26 * fade;
  // Dithered so the dark gradients never band.
  return c + (hash(p) - 0.5) / 255.0;
}

/*
 * Frame: an arcade cabinet around the monitor, drawn here: a glossy
 * bezel that hugs the picture, the cabinet's panel with a lit edge trim
 * and a speaker grille in each side band when there is room.
 */
vec3 cabinet(vec2 p, vec4 rect) {
  float s = u_dpr;
  vec2 center = rect.xy + rect.zw * 0.5;
  float v = p.y / u_canvas.y;
  vec3 col = mix(u_cabinet2, u_cabinet, smoothstep(0.0, 1.0, v));
  // Light from above, falling off to the sides.
  col += u_cabinet2 * 0.35 * (1.0 - smoothstep(0.0, 0.7, abs(p.x / u_canvas.x - 0.5) * 2.0)) * (1.0 - v);
  // Speaker grilles in the side bands.
  float band = rect.x;
  if (band > 70.0 * s) {
    float gx = p.x < center.x ? band * 0.5 : u_canvas.x - band * 0.5;
    vec2 g = vec2(gx, u_canvas.y * 0.72);
    float radius = min(band * 0.3, u_canvas.y * 0.13);
    float pitch = 7.0 * s;
    vec2 cell = mod(p - g, pitch) - pitch * 0.5;
    float hole = 1.0 - smoothstep(1.2 * s, 2.0 * s, length(cell));
    float inGrille = 1.0 - smoothstep(radius - s, radius, length(p - g));
    col = mix(col, col * 0.35, hole * inGrille);
    float ring = abs(length(p - g) - radius - 3.0 * s);
    col += u_bezelHi * 0.18 * (1.0 - smoothstep(0.0, 1.5 * s, ring));
  }
  // The lit trim along the cabinet's sides.
  float trim = min(p.x, u_canvas.x - p.x);
  col = mix(col, u_trim, (1.0 - smoothstep(3.0 * s, 4.0 * s, trim)) * 0.85);
  col += u_trim * 0.12 * (1.0 - smoothstep(4.0 * s, 26.0 * s, trim));
  // The monitor's bezel around the picture.
  float width = u_bezelWidth;
  float d = roundBox(p - center, rect.zw * 0.5 + width, 10.0 * s + width * 0.5);
  if (d < 0.0) {
    float t = clamp(-d / width, 0.0, 1.0);
    float top = clamp((p.y - (rect.y - width)) / (rect.w + 2.0 * width), 0.0, 1.0);
    vec3 b = mix(u_bezelHi, u_bezel, smoothstep(0.0, 0.35, top));
    // A bevel: light on the outer edge, a shadow toward the glass.
    b += u_bezelHi * 0.25 * (1.0 - smoothstep(0.0, 2.0 * s, -d));
    b *= mix(1.0, 0.55, smoothstep(0.6, 1.0, t));
    col = mix(b, col, clamp(d + 1.0, 0.0, 1.0));
  } else {
    // The bezel's shadow on the panel.
    col *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 18.0 * s, d));
  }
  return col + (hash(p) - 0.5) / 255.0;
}

vec3 bandColor(vec2 p, vec4 rect, float bands) {
  if (bands > 1.5) return cabinet(p, rect);
  if (bands > 0.5) return ambient(p, rect);
  return u_black;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y);
  bool reference = u_split >= 0.0 && p.x < u_split;
  vec4 rect = reference ? u_rectRef : u_rect;
  float style = reference ? 0.0 : u_style;
  float bands = reference ? 0.0 : u_bands;
  vec2 inRect = (p - rect.xy) / rect.zw;
  vec3 col;
  if (style > 2.5) {
    col = inRect.x >= 0.0 && inRect.y >= 0.0 && inRect.x <= 1.0 && inRect.y <= 1.0
      ? edgesPixel(inRect, rect.zw / u_preSize)
      : bandColor(p, rect, bands);
  } else if (style > 1.5) {
    // The tube: a rounded dark glass the size of the picture, the bulged
    // picture inside it.
    vec2 center = rect.xy + rect.zw * 0.5;
    float radius = min(rect.z, rect.w) * 0.05;
    float glass = clamp(0.5 - roundBox(p - center, rect.zw * 0.5, radius), 0.0, 1.0);
    vec3 outside = bandColor(p, rect, bands);
    if (glass <= 0.0) {
      col = outside;
    } else {
      float lit;
      vec3 tube = crtPixel(p, rect, lit);
      col = mix(outside, mix(u_black, tube, lit), glass);
    }
  } else if (inRect.x >= 0.0 && inRect.y >= 0.0 && inRect.x <= 1.0 && inRect.y <= 1.0) {
    col = style > 0.5 ? sharpPixel(inRect, rect.zw / u_srcSize) : smoothPixel(inRect);
  } else {
    col = bandColor(p, rect, bands);
  }
  gl_FragColor = vec4(col, 1.0);
}
"""

    const val EDGES_SHADER = """
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_src;
uniform vec2 u_srcSize;
uniform vec2 u_outSize;

vec3 at(vec2 texel) {
  return texture2D(u_src, (clamp(texel, vec2(0.0), u_srcSize - 1.0) + 0.5) / u_srcSize).rgb;
}

/* Colors are "the same" when close in a luma-weighted distance. */
bool same(vec3 a, vec3 b) {
  vec3 d = a - b;
  float y = dot(d, vec3(0.299, 0.587, 0.114));
  float u = d.b - y;
  float v = d.r - y;
  return (48.0 * abs(y) + 7.0 * abs(u) + 6.0 * abs(v)) < 1.2;
}

void main() {
  // Row t of this texture is row t of the game (no flip).
  vec2 pos = gl_FragCoord.xy / u_outSize * u_srcSize;
  vec2 texel = floor(pos);
  vec2 f = pos - texel - 0.5;
  vec2 dir = vec2(f.x < 0.0 ? -1.0 : 1.0, f.y < 0.0 ? -1.0 : 1.0);
  vec3 c = at(texel);
  vec3 side = at(texel + vec2(dir.x, 0.0));
  vec3 vert = at(texel + vec2(0.0, dir.y));
  vec3 back = at(texel - vec2(dir.x, 0.0));
  vec3 down = at(texel - vec2(0.0, dir.y));
  vec3 col = c;
  if (same(side, vert) && !same(c, side) && !same(side, back) && !same(vert, down)) {
    // Distance past the quarter's diagonal, in enlarged pixels.
    vec2 q = abs(f) * 2.0;
    vec2 scale = u_outSize / u_srcSize;
    float past = (q.x + q.y - 1.0) * 0.5 * min(scale.x, scale.y);
    col = mix(c, side, clamp(past + 0.5, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
}
"""
}
