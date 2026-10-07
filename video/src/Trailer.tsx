// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Chip, inAt, KineticTitle, Mark, outAt, Phone, Screen, Sub, Wordmark } from "./components";
import { T } from "./takes";
import { captions, musicVolume, scene, SCENES, TOTAL, VOICE_LEAD } from "./timeline";
import { C, D, EASE_IN, F, sec } from "./theme";

export const TRAILER_FRAMES = TOTAL;

const at = (id: Parameters<typeof scene>[0]) => {
  const sc = scene(id);
  return { from: sc.from, len: sc.len };
};

/** A title block on one side and a take on the other, swapping sides scene by scene. */
function Split({ len, title, sub, chips = [], side = "left", children }: { len: number; title: string; sub?: string; chips?: { text: string; color?: string }[]; side?: "left" | "right"; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const exit = outAt(frame, len, D.quick);
  const words = (
    <div style={{ width: 560, display: "flex", flexDirection: "column", gap: 26, opacity: exit, transform: `translateY(${(1 - exit) * -24}px)` }}>
      <KineticTitle text={title} start={4} size={76} />
      {sub && <Sub start={14}>{sub}</Sub>}
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
          {chips.map((c, i) => (
            <Chip key={c.text} color={c.color} start={20 + i * 3}>
              {c.text}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <AbsoluteFill style={{ flexDirection: side === "left" ? "row" : "row-reverse", alignItems: "center", justifyContent: "center", gap: 70, padding: "0 90px" }}>
      {words}
      <div style={{ flexShrink: 0 }}>{children}</div>
    </AbsoluteFill>
  );
}

function Intro({ len }: { len: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Anticipation: the mark dips, then pops past full size and settles.
  const pop = spring({ frame: frame - 6, fps, config: { damping: 9, stiffness: 160, mass: 0.8 } });
  const dip = interpolate(frame, [0, 6], [1, 0.85], { extrapolateRight: "clamp" });
  const word = inAt(frame, 16, D.reveal);
  const exit = outAt(frame, len, D.standard);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36, opacity: exit, transform: `scale(${0.96 + 0.04 * exit})` }}>
      <div style={{ transform: `scale(${frame < 6 ? dip : pop}) rotate(${(1 - pop) * -12}deg)`, filter: `drop-shadow(0 20px 50px ${C.accent}55)` }}>
        <Mark size={180} />
      </div>
      <div style={{ opacity: word, transform: `translateY(${(1 - word) * 30}px)` }}>
        <Wordmark size={110} />
      </div>
      <Sub start={30} style={{ fontSize: 38 }}>
        Arcade nights, online.
      </Sub>
    </AbsoluteFill>
  );
}

function End({ len }: { len: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 2, fps, config: { damping: 11, stiffness: 150 } });
  const pulse = 1 + Math.sin((frame / fps) * Math.PI * 1.2) * 0.015;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, opacity: outAt(frame, len, D.reveal) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 30, transform: `scale(${(0.85 + 0.15 * pop) * pulse})` }}>
        <Mark size={130} />
        <Wordmark size={120} />
      </div>
      <KineticTitle text="Play together, from *anywhere.*" start={12} size={58} align="center" />
      <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
        <Chip start={26}>go-link.org</Chip>
        <Chip start={30} color={C.ok}>Free · open source (MIT)</Chip>
        <Chip start={34} color={C.voice}>macOS · Windows · Linux · Raspberry Pi</Chip>
      </div>
      <Sub start={40} style={{ fontFamily: F.mono, fontSize: 26, color: C.faint }}>
        github.com/lordbasex/go-link
      </Sub>
    </AbsoluteFill>
  );
}

/** The cut between scenes: a band of the accent color sweeps across. */
function Wipe({ at: start }: { at: number }) {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [start - 5, start + 5], [-30, 130], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN });
  if (frame < start - 5 || frame > start + 5) return null;
  return <AbsoluteFill style={{ background: `linear-gradient(100deg, transparent ${x - 12}%, ${C.accent}22 ${x - 4}%, ${C.accent}55 ${x}%, transparent ${x + 3}%)` }} />;
}

/** The music: "System Awakening", made by the author with ElevenLabs, ducked under the narrator. */
export const MUSIC = { file: "music/system-awakening.wav", from: 0 };

/**
 * Burned-in subtitles: one phrase at a time, low in the frame on a dark
 * capsule, rising in as the narrator says it.
 */
function Captions() {
  const frame = useCurrentFrame();
  const c = captions().find((x) => frame >= x.from && frame < x.to);
  if (!c) return null;
  const v = Math.min(1, (frame - c.from) / 5, (c.to - frame) / 4);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 54 }}>
      <div
        style={{
          maxWidth: 1300,
          padding: "12px 28px",
          borderRadius: 16,
          background: "rgba(8, 9, 13, 0.78)",
          color: C.text,
          fontFamily: F.text,
          fontWeight: 600,
          fontSize: 38,
          lineHeight: 1.25,
          textAlign: "center",
          opacity: v,
          transform: `translateY(${(1 - v) * 10}px)`,
        }}
      >
        {c.text}
      </div>
    </AbsoluteFill>
  );
}

export function Trailer() {
  const s = (id: Parameters<typeof scene>[0]) => at(id);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Backdrop />
      <Sequence from={s("intro").from} durationInFrames={s("intro").len}>
        <Intro len={s("intro").len} />
      </Sequence>
      <Sequence from={s("home").from} durationInFrames={s("home").len}>
        <Split len={s("home").len} title="Your games stay on *your* computer." sub="go-link runs MAME at home and streams it. Your ROMs never leave your disk." side="left">
          <Screen take="landing" from={T.landing.hero} url="go-link.org" duration={s("home").len} />
        </Split>
      </Sequence>
      <Sequence from={s("friends").from} durationInFrames={s("friends").len}>
        <Split len={s("friends").len} title="Friends play from the *browser.*" sub="Nothing to install. A code, a PIN, and you're in." side="right">
          <Screen take="guest" from={T.guest.join} rate={1.5} duration={s("friends").len} />
        </Split>
      </Sequence>
      <Sequence from={s("invite").from} durationInFrames={s("invite").len}>
        <Split len={s("invite").len} title="Invite with a link, a code or a *QR.*" chips={[{ text: "one PIN, one person" }, { text: "private rooms", color: C.ok }]} side="left">
          <Screen take="room" from={T.room.invite} duration={s("invite").len} focus={{ x: 0.5, y: 0.45, zoom: 1.18, at: 20 }} />
        </Split>
      </Sequence>
      <Sequence from={s("controls").from} durationInFrames={s("controls").len}>
        <Split len={s("controls").len} title="Real controllers. *Real voice.*" chips={[{ text: "P1 · P2 · P3 · P4" }, { text: "voice chat", color: C.voice }, { text: "keyboard & gamepads", color: C.p4 }]} side="right">
          <Screen take="room" from={T.room.controls} duration={s("controls").len} focus={{ x: 0.82, y: 0.5, zoom: 1.25, at: 30 }} />
        </Split>
      </Sequence>
      <Sequence from={s("phone").from} durationInFrames={s("phone").len}>
        <Split len={s("phone").len} title="Your phone becomes a *console.*" sub="Held upright it's a handheld; sideways, both hands." side="left">
          <Phone take="phone" from={T.phone.play} duration={s("phone").len} height={820} />
        </Split>
      </Sequence>
      <Sequence from={s("maker").from} durationInFrames={s("maker").len}>
        <Split len={s("maker").len} title="Make your own *arcade games.*" sub="Willy Maker builds a real ROM in the browser, and it plays in a room." side="right">
          <Screen
            duration={s("maker").len}
            clips={[
              { take: "maker", from: T.maker.wizard, rate: 2.4, len: sec(2.6), url: "maker.go-link.org" },
              { take: "maker-2", from: T.makerRoom.play, len: s("maker").len - sec(2.6), url: "play.go-link.org" },
            ]}
          />
        </Split>
      </Sequence>
      <Sequence from={s("metrics").from} durationInFrames={s("metrics").len}>
        <Split len={s("metrics").len} title="Every millisecond, *measured.*" chips={[{ text: "latency", color: C.ok }, { text: "lost packets", color: C.p3 }, { text: "freezes explained" }]} side="left">
          <Screen
            duration={s("metrics").len}
            clips={[
              { take: "room", from: T.room.latency, len: sec(2.4) },
              { take: "network", from: T.network.charts, len: s("metrics").len - sec(2.4) },
            ]}
          />
        </Split>
      </Sequence>
      <Sequence from={s("end").from} durationInFrames={s("end").len}>
        <End len={s("end").len} />
      </Sequence>
      {SCENES.slice(1).map((sc) => (
        <Wipe key={sc.id} at={at(sc.id).from} />
      ))}
      {SCENES.map((sc) => (
        <Sequence key={`voice-${sc.id}`} from={at(sc.id).from + VOICE_LEAD} durationInFrames={sc.voice + 15}>
          <Audio src={staticFile(`voice/${sc.id}.wav`)} volume={1} />
        </Sequence>
      ))}
      <Audio src={staticFile(MUSIC.file)} startFrom={MUSIC.from} volume={(f) => musicVolume(f, 0.3, 0.2)} />
      <Captions />
    </AbsoluteFill>
  );
}


