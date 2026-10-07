# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
"""The trailer's narrator: one WAV per scene and language from
src/narration.json, with Kokoro (Apache-2.0 model, kokoro-onnx), each brought
to -16 LUFS with a limiter. It also writes src/narration-durations.json,
which sets how long each scene lasts.

    KOKORO_DIR=/path/with/kokoro-v1.0.onnx+voices-v1.0.bin \\
      python scripts/voice.py en es pt

Needs a Python with kokoro-onnx and soundfile, espeak-ng (brew install
espeak-ng; ESPEAK_LIB and ESPEAK_DATA override its paths) and ffmpeg.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import EspeakConfig, Kokoro

here = Path(__file__).resolve().parent.parent
narration = json.loads((here / "src/narration.json").read_text())
kdir = Path(os.environ.get("KOKORO_DIR", "."))
espeak = EspeakConfig(
    lib_path=os.environ.get("ESPEAK_LIB", "/usr/local/opt/espeak-ng/lib/libespeak-ng.dylib"),
    data_path=os.environ.get("ESPEAK_DATA", "/usr/local/opt/espeak-ng/share/espeak-ng-data"),
)
k = Kokoro(str(kdir / "kokoro-v1.0.onnx"), str(kdir / "voices-v1.0.bin"), espeak_config=espeak)

durations_file = here / "src/narration-durations.json"
durations = json.loads(durations_file.read_text()) if durations_file.exists() else {}

for lang in sys.argv[1:] or ["en"]:
    raw, out = here / "public/voice-raw" / lang, here / "public/voice" / lang
    raw.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    durations[lang] = {}
    for scene, text in narration["lines"][lang].items():
        # "go-link" reads better as two words.
        samples, rate = k.create(text.replace("go-link", "go link"), voice=narration["voices"][lang], speed=1.0, lang=narration["kokoroLang"][lang])
        sf.write(raw / f"{scene}.wav", samples, rate)
        # -16 LUFS (YouTube and social media), the peaks held under -1 dBTP.
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(raw / f"{scene}.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", "48000", str(out / f"{scene}.wav")],
            check=True,
        )
        durations[lang][scene] = round(len(samples) / rate, 2)
    print(lang, json.dumps(durations[lang]))

durations_file.write_text(json.dumps(durations, indent=2) + "\n")
