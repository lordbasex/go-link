# Video quality lab

The lab measures what players really see: it records the exact picture the core draws, sends it through the device's real encoder path, decodes it the way a browser does and compares the two. The tool is `backend-device/cmd/framelab` with its plumbing in `backend-device/pkg/framelab`.

**Game pictures never leave the lab machine.** Captures, decoded frames and reports hold copyrighted game art: keep them in a gitignored folder (for example `dist/evidencia/`), never commit, publish or paste them into docs. The tool itself has no game names: ROM paths are arguments.

## Build

```bash
cd backend-device
go build -o /tmp/framelab ./cmd/framelab
```

It needs the same libraries as the device (libvpx, Opus) and **ffmpeg** with the `libvpx` decoder (and `libvmaf` for `-vmaf`) on the `PATH`.

## 1. Reference frames

```bash
framelab capture -core <core library> -rom <game.zip> -out <dir> \
  -frames 7200 -script "1800-1806:coin 1900-1906:start 2000-7200:play" \
  -stills 720,1680,3000 -clip 3420:120
```

- It runs the core through `services.OpenGameCore`, the same code the `device emulate` worker uses: the same core options, button mapping and frame handling. The `RawVideo` hook hands over each frame before the I420 conversion; `libretro.ToRGB` expands it exactly like the encoder input (RGB565 `<<3`/`<<2`, no bit replication).
- The core runs as fast as the machine allows, from power on, with a fresh system folder inside `-out`, so two runs with the same script give identical frames.
- `-script` holds buttons per frame range in the device's input bits: `FROM-TO:BUTTONS[@PORT]`, buttons `up down left right b1..b6 start coin`, port 1-4. `play` walks and taps attack buttons on its own (deterministic), so gameplay scenes appear without a person.
- Output: `run.glrun` (every frame, lossless, gzip-compressed RGB), `stills/fNNNNNN.png`, `clip/fNNNNNN.png` (consecutive frames for motion tests) and `meta.json` (native size, display aspect, core fps, the fps the device gives the encoder, pixel format).
- `framelab extract -run run.glrun -every 120 -out <dir>` dumps frames to choose stills from (a contact sheet: `ffmpeg -pattern_type glob -i '<dir>/*.png' -vf scale=192:-1,tile=10x6 sheet.png`). The picture size must not change during a run.

## 2. Encode and decode like a player

```bash
framelab encode -capture <capture dir> -variant "name=B,scale=2,kbps=5000" -out <dir> -vmaf
```

- **Encoder:** `pkg/encoder` VP8, the device's code, fed every frame of the run at the device's stream frame rate, with a keyframe first. `encoder.Config` takes optional `MinQuantizer`, `MaxQuantizer` and `CPUUsed`; zero keeps the streaming defaults.
- **Variant keys** (missing keys keep the device's settings): `scale` (integer nearest-neighbour upscale before the I420 conversion), `kbps`, `minq`, `maxq`, `cpu`, `chroma` (`topleft`, the device's conversion, or `box`, a 2x2 average) and `codec` (`vp8`, or `vp9` through ffmpeg's libvpx-vp9 in real-time mode, for reference only).
- **Decoder:** ffmpeg with libvpx (the decoder Chrome uses for VP8). A frame the rate control skipped keeps showing the previous picture, as in a browser.
- **Back to RGB:** BT.601 limited range with the chroma sampled bilinearly at the center of each 2x2 block (`framelab.Bilinear`, GPU texture sampling), and again with the chroma repeated over each block (`framelab.Replicate`, libyuv). Chrome's `texImage2D(video)` and canvas `drawImage(video)` were checked against `Bilinear`: 63-73 dB PSNR apart, identical to within rounding.
- **Metrics** (`framelab.Compare`): PSNR over RGB, PSNR of Y, Cb and Cr (full range BT.601), SSIM of Y and the mean SSIM of R, G and B (Gaussian 11x11, sigma 1.5). An upscaled stream is averaged back down to the native size before comparing (`native`), and also compared with the reference upscaled the same way (`scaled`). Every frame of the run gets PSNR (`run_psnr`); stills and clip frames get everything. `-vmaf` adds VMAF and MS-SSIM on the clip, with both clips scaled to 1080 lines by nearest neighbour.
- **Cost:** average and peak (one second window) kbps, keyframes, skipped frames, conversion time, encoder wall time (mean and 95th percentile) and CPU time per frame.
- Output: `stream.ivf`, `result.json` and the decoded `stills/` and `clip/` PNGs.

## 3. Helpers

- `framelab compare [-down N] A B`: the metrics of B against A, two PNGs or two folders matched by file name, as JSON lines. Used for pictures rendered by the website.
- `framelab hotspot -ref A -img B [-down N] -w 64 -h 48`: the window where B differs most, for zoomed crops.
- `framelab crop -in PNG -rect X,Y,W,H -zoom 4 -out PNG`: a nearest-neighbour zoom of one area.

## Findings (2026-09-29)

Three games from different arcade boards (one at 384x224, two at 288x224), 7,200 frames each (attract mode and scripted play), on an Intel i9-10900. Means of the three games, stills as Chrome shows them:

| Variant | Average kbps | Encoder CPU ms/frame | RGB PSNR | SSIM-RGB | SSIM-Y | VMAF (clip) |
|---|---|---|---|---|---|---|
| Today: native, 2,500 kbps target | 1,655 | 0.91 | 25.9 dB | 0.883 | 0.9924 | 88.8 |
| Native, 2x2 averaged chroma | 1,595 | 1.09 | 27.1 dB | 0.894 | 0.9935 | 90.7 |
| Native, quantizer 1-40, 4,000 kbps | 2,216 | 1.13 | 26.1 dB | 0.887 | 0.9958 | 90.4 |
| 2x nearest, 2,500 kbps | 2,017 | 2.80 | 32.7 dB | 0.948 | 0.9932 | 89.2 |
| 2x nearest, 3,500 kbps | 2,607 | 2.78 | 33.2 dB | 0.955 | 0.9963 | 91.5 |
| 2x nearest, 5,000 kbps | 3,116 | 2.40 | 33.5 dB | 0.960 | 0.9985 | 92.6 |
| VP9 (ffmpeg), 2x, 2,500 kbps | 2,362 | 3.69 | 32.6 dB | 0.945 | 0.9908 | 88.7 |

- **At native size the codec is not the limit; 4:2:0 color is.** A near-lossless VP8 (quantizer 1) scores the same as today's stream. Luma is clean, but each 2x2 block has one color, so one-pixel color detail of pixel art (red text, outlines, highlights) bleeds, whatever the bitrate.
- **A 2x nearest-neighbour upscale before encoding** gives each source pixel its own chroma sample: about +7 dB RGB PSNR at a 3,500 kbps target (+58% real bitrate), with luma better than today too. At a 2,500 kbps target it keeps most of the color gain with luma equal to today; below that, luma suffers.
- **Averaging the chroma** at native size costs nothing and gains about 1.2 dB.
- **The website renderer must know the stream is 2x** and average it back to native before its styles: fed the raw 2x picture, CRT draws twice as many scanlines and xBR cannot smooth 2-pixel steps. Averaged first, every style gains 6.8 to 9.2 dB over today's stream.
- **CPU:** a 2x frame costs about 3x the encoder time. The 2x I420 conversion should be one fused pass (the current conversion takes 0.37-0.50 ms per native frame; converting after a separate upscale takes 1.9 ms). Slow hosts such as a Raspberry Pi 4 are estimated not to fit it, so they need the native path.

## What shipped (2026-09-29)

The approved variant is **B3500**: 2x nearest neighbour before encoding, VP8 settings unchanged, target 3,500 kbps. It became the device's `high` video quality (the default); `normal` is B2500 and `saver` is the native path with averaged chroma (the table's "Native, 2x2 averaged chroma"). See [device.md](device.md#video-quality) and [protocol.md](protocol.md#video-scale).

- **One-pass conversion.** `libretro.ToI420Double` writes the 2x I420 frame straight from the core's pixels: each source pixel computes Y, Cb and Cr once, writes a 2x2 luma block and one chroma sample. A test proves it equals upscaling first and then `ToI420`, bit for bit, for the three pixel formats and odd sizes; `libretro.ToI420Box` equals the lab's `ToI420Box` the same way. Go benchmarks on the i9-10900 (384x224 RGB565): old conversion 0.49 ms, 2x fused 0.55 ms, Saver 0.60 ms, separate upscale then conversion 3.3 ms.
- **`framelab encode` uses the device's conversions** (`Variant.PrepareFrame`) for the variants the device has, so `prep_ms` is the real cost, and reports the encoder's `encode_p50_ms` and `encode_p95_ms`.
- **Measured after the change** (`framelab encode`, the same three games, 7,200 frames each, i9-10900; conversion now the device's one pass; encoder wall time per frame):

  | Variant | Conversion | Encoder p50 | Encoder p95 | Encoder CPU | Average kbps | RGB PSNR |
  |---|---|---|---|---|---|---|
  | Old native (A) | 0.40 ms | 0.57 ms | 1.31 ms | 0.88 ms | 1,655 | 25.9 dB |
  | Saver (F) | 0.52 ms | 0.57 ms | 1.30 ms | 0.89 ms | 1,594 | 27.1 dB |
  | Normal (B2500) | 0.48 ms | 1.41 ms | 2.87 ms | 2.25 ms | 2,016 | 32.7 dB |
  | High (B3500) | 0.47 ms | 1.34 ms | 2.90 ms | 2.19 ms | 2,605 | 33.2 dB |

  The fused 2x conversion costs about the same as the old native one (the lab's separate upscale took 1.9 ms). A 2x room's encoder p95 (2.2-3.5 ms per game) stays far below the fallback limit (10 ms at 60 fps) on this machine. Quality and bitrate match the lab's B3500 exactly.
- **Automatic fallback.** A 2x room measures its encoder for two seconds; a 95th percentile above 60 % of the frame's time moves it to saver, shown as "Saver (CPU)".
- **Website.** When `stream_stats.video.scale` is 2 the renderer averages each 2x2 block back to one game pixel (a texture of the game's size) before every style and the ambient light. Checked in headless Chromium on the test card at 1920x1080: a 2x nearest-neighbour source drawn this way is identical to the native source in every style and side (0 values differ); drawn raw, CRT fell to 24.7 dB, smooth to 29.0 dB and smooth edges to 36.0 dB against it.

