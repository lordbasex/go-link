# go-link HD: streaming above the CPS-1 (experiment T-31)

Task T-31 of [experiment 1's verdict](verdict.md), from the user's vision (2026-10-02): after the CPS-1 and bigger MAME boards, an own 2D "chip" with HD graphics for 4K screens and phones, where the host does all the work and every viewer only receives the stream. Before designing that chip, this experiment answers one question with numbers: **how big a picture can the device draw, encode and stream at 60 fps, and with which encoder?**

## Method

- **The scene** (`backend-device/pkg/hdscene`): two pictures made with an image AI during the prompt tests (T-29), a stormy night sky as the far layer scrolling at half speed and a harbour as the play layer scrolling at full speed (its #FF00FF transparent), plus a ball bouncing across: detailed, always moving, like a 2D game's camera. It is composed straight into I420 from layers converted once (opaque runs per row, memory copies), so drawing costs **0.4 ms a frame at 720p, 0.9 ms at 1080p and 3 ms at 4K** and never hides the encoder's time.
- **The encoders, alone** (`device hdbench`): 10 s of the scene at 60 fps per size, encoded by the stream's own VP8 (libvpx, in the device's process), and, through ffmpeg, by the Mac's hardware H.264 (VideoToolbox) and by x264 (software, `ultrafast`, `zerolatency`). For each: the encode time per frame (average and 95th percentile), the frames a second it could keep, the bitrate against the target and the process CPU. "Realtime at 60" means the 95th percentile fits in 60 % of a frame (10 ms), the device's own rule for a room's encoder (`video_quality.go`), so the rest of the device still has room.
- **End to end** (`e2e/tests/hd.spec.ts`, run on demand): the device's test room streams the scene with `--test-room-hd SIZE` through the real WebRTC path (VP8, 8 encoder threads), a Chrome joins the room, and over 15 s it counts the frames its video element shows and drops, while the device's CPU is sampled; the room's Connection details give the sent and received rates.
- **The computer:** the user's Mac Pro 2019 (MacPro7,1): a 10-core Intel CPU with 20 threads, an AMD Radeon RX 580 and 128 GB. Host and browser on the same machine, so the network is not measured here (a 1080p stream needs about 8 Mbps).

Commands, to repeat it:

```sh
cd backend-device && go build -tags headless -o /tmp/device ./cmd/device
/tmp/device hdbench --far FAR.png --play PLAY.png --res 720p,1080p,2160p --seconds 10 [--threads 8] [--cpu-used 16] [--encoder videotoolbox|x264] [--json]
cd ../e2e && E2E_HD=out.json E2E_DEVICE_ARGS="--test-room-hd 1080p --hd-far FAR.png --hd-play PLAY.png" npx playwright test tests/hd.spec.ts --project=web
```

## The encoders, alone (60 fps, 10 s)

| Size | Encoder | Encode avg | p95 | Max fps | Realtime at 60 | Bitrate (target) | CPU |
|---|---|---|---|---|---|---|---|
| 720p | VP8, the stream's (2 threads, speed 8) | 5.3 ms | 6.2 ms | 190 | yes | 3.7 Mbps (4) | 1.4 cores |
| 720p | VP8, 8 threads | 4.0 ms | 4.8 ms | 252 | yes | 3.8 Mbps (4) | 2.1 cores |
| 720p | VideoToolbox H.264 (hardware) | 3.6 ms | 4.2 ms | 279 | yes | 4.1 Mbps (4) | 0.4 cores |
| 720p | x264 ultrafast | 1.4 ms | 1.9 ms | 707 | yes | 3.9 Mbps (4) | 0.9 cores* |
| 1080p | VP8, the stream's | 9.3 ms | 14.1 ms | 107 | no (p95) | 7.4 Mbps (8) | 1.5 cores |
| 1080p | VP8, 8 threads | 8.8 ms | 11.2 ms | 114 | just over | 7.4 Mbps (8) | 2.1 cores |
| 1080p | VP8, 8 threads, speed 16 | 4.3 ms | 5.1 ms | 234 | yes | 16 Mbps (8): the rate control lets go | 2.7 cores |
| 1080p | VideoToolbox H.264 | 7.1 ms | 8.3 ms | 140 | yes | 8.1 Mbps (8) | 0.5 cores |
| 1080p | x264 ultrafast | 3.5 ms | 4.3 ms | 286 | yes | 7.8 Mbps (8) | 0.9 cores* |
| 4K | VP8, the stream's | 27.6 ms | 29.5 ms | 36 | no | 39 Mbps (25) | 1.6 cores |
| 4K | VP8, 8 threads | 18.3 ms | 20.6 ms | 55 | no | 64 Mbps (25) | 2.8 cores |
| 4K | VideoToolbox H.264 | 25.9 ms | 28.6 ms | 39 | no | 24 Mbps (25) | 0.5 cores |
| 4K | x264 ultrafast | 12.7 ms | 14.4 ms | 79 | no (p95) | 24 Mbps (25) | 0.9 cores* |

\* The CPU column is the device's own process; with ffmpeg the encoder runs in ffmpeg's, so it is not counted there. Timing ffmpeg on frames already on disk (`ffmpeg -benchmark`, 300 frames) gave the same order: x264 459 fps at 1080p and 130 fps at 4K using about 7 cores, VP8 63 fps at 4K with 3.6 cores, VideoToolbox H.264 32 fps and HEVC 41 fps at 4K.

## End to end, in a room (VP8, 8 threads)

| Size | Shown by Chrome | Dropped | Sent / received (Connection details) | Device CPU |
|---|---|---|---|---|
| 720p | 59.6 fps | 1.9 a second | 60 / 57-60 fps | 1.25 cores |
| 1080p | 59.7 fps | 4.3 a second | 59.6 / 59-60 fps | 1.9 cores |
| 4K | 25.8 fps | 0 | 25.9 / 26 fps | 2.5 cores |

The dropped frames are Chrome's (the same computer also decoded and drew the stream, through the rooms' WebGL renderer).

## The same, on Apple Silicon (M1)

Measured on 2026-10-03 on the user's MacBook Pro M1 (8 cores, 16 GB, macOS 27), with the same release binary (`hdbench`, 10 s at 60 fps) and Homebrew's ffmpeg for the hardware and x264 encoders.

| Size | Encoder | Encode avg | p95 | Max fps | Realtime at 60 | Bitrate (target) | CPU |
|---|---|---|---|---|---|---|---|
| 720p | VP8, the stream's | 3.7 ms | 4.8 ms | 270 | yes | 3.7 Mbps (4) | 1.4 cores |
| 720p | VideoToolbox H.264 | 4.1 ms | 5.4 ms | 242 | yes | 4.2 Mbps (4) | 0.5 cores |
| 720p | x264 ultrafast | 1.0 ms | 1.1 ms | 1020 | yes | 3.9 Mbps (4) | 0.6 cores* |
| 1080p | VP8, the stream's | 8.3 ms | 10.9 ms | 121 | just over | 7.4 Mbps (8) | 1.4 cores |
| 1080p | VP8, 4 threads | 8.1 ms | 12.2 ms | 124 | no (p95) | 7.4 Mbps (8) | 2.5 cores |
| 1080p | VideoToolbox H.264 | 5.3 ms | 6.4 ms | 187 | yes | 8.3 Mbps (8) | 0.5 cores |
| 1080p | x264 ultrafast | 2.3 ms | 2.6 ms | 430 | yes | 7.8 Mbps (8) | 0.6 cores* |
| 4K | VP8, the stream's | 15.7 ms | 16.1 ms | 64 | no | 26 Mbps (25) | 1.6 cores |
| 4K | VP8, 8 threads | 20.0 ms | 22.8 ms | 50 | no | 64 Mbps (25) | 4.3 cores |
| 4K | VideoToolbox H.264 | 16.0 ms | 17.6 ms | 63 | no | 23 Mbps (25) | 0.4 cores |
| 4K | x264 ultrafast | 9.1 ms | 10.0 ms | 110 | at the limit | 24 Mbps (25) | 0.6 cores* |

On 300 raw 4K frames (`ffmpeg -benchmark`): the hardware H.264 encodes 54-55 fps whatever its options (`-realtime`, `-prio_speed`, baseline profile), the hardware HEVC 79 fps, and x264 149 fps using about 3.8 of the 8 cores. Every encoder on the M1 also had rare single frames of 30-170 ms (the maximums), worth watching in a real room.

On the M1 the picture changes: VP8 is faster than on the Intel Mac Pro at every size but still not 4K60, and its rate control overshoots at 4K with more threads; the media engine does 1080p60 with half a core, but its H.264 stays just under 4K60 (HEVC reaches it, but WebRTC browsers do not all carry HEVC); **x264 does 4K60 with half the M1's cores**.

## What the numbers say

1. **1080p at 60 fps works today**, with the device's own stack: VP8 in software, 8 encoder threads, about 2 cores of the Mac Pro and 7-8 Mbps; a room showed 59.7 fps. 720p takes 1.25 cores and 4 Mbps, a safe default for smaller hosts and phones on mobile data.
2. **4K at 60 fps does not, with VP8:** 26 fps end to end, and the rate control overshoots (39-64 Mbps for a 25 Mbps target). On this Intel Mac the hardware encoder is no faster (VideoToolbox: 39 fps at 4K). x264 reaches 79 fps alone but its 95th percentile still misses the 10 ms budget, using most of the cores.
3. **Drawing is cheap, encoding and the network are the cost:** the HD scene composes in under a millisecond at 1080p. An own 2D engine at HD costs the host little CPU for the picture; what grows with the size is the encoder's time and the bitrate (about 4, 8 and 25 Mbps).
4. **VP8's speed setting is not free:** at speed 16 it is twice as fast but doubles the bitrate (its rate control lets go), so the gain has to come from threads or another codec.

## Decision

- **go-link HD, first version: 1920 × 1080 at 60 fps**, streamed as VP8 with 8 encoder threads (what the experiment proved end to end), with **1280 × 720** as the fallback, to be chosen by the same encoder check the device already runs between 2x and saver for the CPS-1 (`video_quality.go`; not built for HD yet). The own 2D "chip" can therefore draw a 1080p picture (for example a 480 × 270 or 640 × 360 pixel-art screen scaled 4x or 3x by the device, or real HD art).
- **4K is a second step and needs H.264:** WebRTC carries it in every browser. The M1 measurement says the way there is x264 in software (110-149 fps at 4K on Apple Silicon, about half its cores), not the M1's media engine (54-63 fps for H.264); on Intel hosts neither reaches it. Next step: an H.264 track in the device's WebRTC stream (x264, with the hardware encoder for 1080p, where it costs half a core), then `hd.spec.ts` end to end at 4K.
- **Viewers:** 8 Mbps for 1080p fits home connections; phones get 720p (4 Mbps). Adapting the size to each viewer is future work: today every viewer of a room gets the same stream.

## Tools added for it

- `backend-device/pkg/hdscene`: the HD test scene, composed in I420 (tests and a 1080p benchmark).
- `device hdbench`: the encoder measurement above (`--encoder vp8|videotoolbox|x264`, `--threads`, `--cpu-used`, `--raw` to write the frames for timing other encoders).
- `device --test-room-hd 720p|1080p|2160p --hd-far PICTURE [--hd-play PICTURE] [--hd-kbps N] [--hd-threads N]`: the test room streams the scene instead of the test card.
- `pkg/encoder` `Config.Threads` and `StreamConfig.EncoderThreads`: libvpx's thread count (the streaming default stays 2; VP8 shares the work with token partitions above 2).
- `e2e/tests/hd.spec.ts`: the end-to-end measurement, skipped unless `E2E_HD` names the output file (`E2E_DEVICE_ARGS` passes the device's flags).
