// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import {
  CHECKSUMS_URL,
  PLATFORMS,
  RELEASE_PAGE,
  RELEASE_VERSION,
  armDownloadFor,
  detectPlatform,
  downloadFor,
  type Platform,
} from "../../downloads";
import { DownloadIcon, PauseIcon, PlayIcon } from "../Icons";

const STEP_MS = 7000;
const CODE = "482913067";
const delay = (s: number): CSSProperties => ({ animationDelay: `${s.toFixed(2)}s` });

/** Step 1: the download drops into the computer, the systems below. */
function SceneDownload({ platform }: { platform: Platform | null }) {
  return (
    <div className="wz-scene wz-col">
      <div className="wz-laptop">
        <span className="wz-drop" aria-hidden="true">
          <DownloadIcon size={30} />
        </span>
        <span className="wz-screen">
          go<span className="wz-accent">-</span>link
        </span>
        <span className="wz-base" />
      </div>
      <div className="wz-chips">
        {PLATFORMS.map((p, i) => (
          <span key={p} className={`wz-chip wz-rise${p === platform ? " is-on" : ""}`} style={delay(0.2 + i * 0.12)}>
            {t.wizard.platform[p]}
            {p === platform && ` · ${t.wizard.scene.yourSystem}`}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Step 2: the code travels from the app to the browser, then "Linked". */
function SceneLink() {
  return (
    <div className="wz-scene wz-row">
      <div className="wz-card wz-app">
        <span className="wz-brand">
          go<span className="wz-accent">-</span>link
        </span>
        <span className="wz-code">
          {CODE.slice(0, 3)} {CODE.slice(3, 6)} {CODE.slice(6)}
        </span>
        <span className="wz-faint">{t.wizard.scene.yourComputer}</span>
      </div>
      <div className="wz-wire" aria-hidden="true">
        {[0, 0.45, 0.9].map((d) => (
          <span key={d} className="wz-dot" style={delay(d)} />
        ))}
      </div>
      <div className="wz-card wz-browser">
        <span className="wz-url">go-link.org/device</span>
        <span className="wz-digits">
          {CODE.split("").map((c, i) => (
            <span key={i} className="wz-digit">
              <span className="wz-pop" style={delay(0.9 + i * 0.13)}>
                {c}
              </span>
            </span>
          ))}
        </span>
        <span className="wz-linked wz-pop" style={delay(2.3)}>
          ✓ {t.wizard.scene.linked}
        </span>
      </div>
    </div>
  );
}

/** Step 3: ROM files fall into the folder, checked, then Play. */
function SceneRoms() {
  const roms = [
    ["game-one.zip", true],
    ["game-two.zip", true],
    ["game-three.zip", false],
    ["game-four.zip", true],
  ] as const;
  return (
    <div className="wz-scene wz-row">
      <div className="wz-folder">
        <svg width="104" height="88" viewBox="0 0 120 100" fill="none" aria-hidden="true">
          <path d="M6 20a8 8 0 0 1 8-8h30l10 10h52a8 8 0 0 1 8 8v56a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" fill="#2a3040" stroke="#f2a33a" strokeWidth="3" />
        </svg>
        <span className="wz-mono wz-faint">~/go-link/roms</span>
      </div>
      <div className="wz-roms">
        {roms.map(([name, ok], i) => (
          <div key={name} className="wz-rom wz-fall" style={delay(0.2 + i * 0.35)}>
            <span className="wz-mono">{name}</span>
            <span className={`wz-pill ${ok ? "is-ok" : "is-bad"}`}>{ok ? t.wizard.scene.ready : t.wizard.scene.missing}</span>
          </div>
        ))}
        <span className="wz-play wz-pop" style={delay(1.9)}>
          <PlayIcon size={14} /> {t.wizard.scene.play}
        </span>
      </div>
    </div>
  );
}

/** Step 4: the invitation (QR and PIN) and friends joining. */
function SceneShare() {
  const qr = "1110111101010111101111000000010110101111011100101";
  const friends = [
    ["A", "#f2a33a"],
    ["B", "#4fc3d9"],
    ["C", "#e0627a"],
  ] as const;
  return (
    <div className="wz-scene wz-row">
      <div className="wz-card wz-invite wz-rise">
        <span className="wz-qr" aria-hidden="true">
          {qr.split("").map((c, i) => (
            <span key={i} className={c === "1" ? "is-on" : undefined} />
          ))}
        </span>
        <span className="wz-faint">go-link.org/g/…</span>
        <span className="wz-pin">PIN 482 913</span>
      </div>
      <div className="wz-friends">
        {friends.map(([initial, color], i) => (
          <div key={initial} className="wz-friend wz-rise" style={delay(0.5 + i * 0.5)}>
            <span className="wz-link-line" aria-hidden="true" />
            <span className="wz-card wz-phone">
              <span className="wz-avatar" style={{ background: color }}>
                {initial}
              </span>
              <span className="wz-joined">{t.wizard.scene.joined}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What step 1 offers: the file for the chosen system, or the Docker command. */
function DownloadChoice({ platform, onPick }: { platform: Platform; onPick: (p: Platform) => void }) {
  const file = downloadFor(platform);
  const arm = armDownloadFor(platform);
  return (
    <div className="wz-downloads">
      <div className="wz-platforms" role="group" aria-label={t.wizard.platformsLabel}>
        {PLATFORMS.map((p) => (
          <button key={p} type="button" className={`wz-platform${p === platform ? " is-on" : ""}`} aria-pressed={p === platform} onClick={() => onPick(p)}>
            {t.wizard.platform[p]}
          </button>
        ))}
      </div>
      {platform === "docker" && (
        <pre className="wz-command">{`docker load < go-link-${RELEASE_VERSION}-docker.oci.tar.gz
docker run -d --name go-link --network host \\
  -v go-link:/data -v ~/roms:/data/go-link/roms \\
  go-link-device:${RELEASE_VERSION}`}</pre>
      )}
      {file && (
        <a className="button button-primary wz-get" href={file.url}>
          <DownloadIcon size={18} />
          {t.wizard.download(t.wizard.platform[platform], file.mb)}
        </a>
      )}
      <span className="small muted">
        {t.wizard.note[platform]}
        {arm && (
          <>
            {" "}
            <a href={arm.url}>{t.wizard.arm(arm.mb)}</a>
          </>
        )}
        {platform === "docker" && (
          <>
            {" "}
            <Link to="/docs/docker">{t.wizard.dockerGuide}</Link>
          </>
        )}
      </span>
      <span className="small muted">
        {RELEASE_VERSION} · <a href={RELEASE_PAGE}>{t.wizard.allDownloads}</a> · <a href={CHECKSUMS_URL}>{t.wizard.checksums}</a>
      </span>
    </div>
  );
}

/** On a phone: go-link installs on a computer, so share the link instead. */
function PhoneShare() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${location.origin}/device`;
    try {
      if (navigator.share) await navigator.share({ url, title: "go-link" });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      // the person closed the share sheet
    }
  };
  return (
    <div className="wz-downloads">
      <span className="small muted">{t.wizard.phoneNote}</span>
      <button type="button" className="button button-secondary wz-get" onClick={() => void share()}>
        {copied ? t.wizard.copied : t.wizard.share}
      </button>
    </div>
  );
}

/**
 * "How it works" as a short animated walkthrough that plays like a video:
 * four steps (download, link, add ROMs and play, share), each with its own
 * animated scene, a progress bar per step, pause and previous/next. Step 1
 * offers the right download for the visitor's system.
 */
export function Wizard({ onDone }: { onDone?: () => void }) {
  const detected = useMemo(() => detectPlatform(), []);
  const [step, setStep] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(
    () => !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches),
  );
  const [platform, setPlatform] = useState<Platform>(detected ?? "windows");
  const steps = t.wizard.steps;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setElapsed((e) => e + 100), 100);
    return () => window.clearInterval(id);
  }, [playing]);
  useEffect(() => {
    if (elapsed < STEP_MS) return;
    setStep((s) => (s % steps.length) + 1);
    setElapsed(0);
  }, [elapsed, steps.length]);

  const go = (n: number) => {
    setStep(n);
    setElapsed(0);
  };
  const cur = steps[step - 1] ?? steps[0]!;

  // The scenes are drawn on a 640x400 board scaled to the stage.
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setScale(e.contentRect.width / 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="wz" aria-roledescription="carousel" aria-label={t.wizard.title}>
      <div className="wz-stage" ref={stageRef} aria-hidden="true">
        <div className="wz-board" style={{ transform: `scale(${scale})` }}>
          {step === 1 && <SceneDownload platform={detected} />}
          {step === 2 && <SceneLink />}
          {step === 3 && <SceneRoms />}
          {step === 4 && <SceneShare />}
        </div>
      </div>
      <div className="wz-text" key={step} aria-live="polite">
        <span className="wz-mono wz-faint">{t.wizard.stepOf(step, steps.length)}</span>
        <h3 className="wz-title">{cur.title}</h3>
        <p className="wz-body">{cur.text}</p>
        {step === 1 &&
          (detected === null && typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? (
            <PhoneShare />
          ) : (
            <DownloadChoice
              platform={platform}
              onPick={(p) => {
                setPlatform(p);
                setPlaying(false);
              }}
            />
          ))}
        {step === steps.length && (
          <Link to="/create" className="button button-primary wz-get" onClick={onDone}>
            {t.wizard.createFirst}
          </Link>
        )}
      </div>
      <div className="wz-bar">
        <div className="wz-segments">
          {steps.map((s, i) => {
            const n = i + 1;
            const pct = n < step ? 100 : n === step ? (elapsed / STEP_MS) * 100 : 0;
            return (
              <button key={s.short} type="button" className={`wz-seg${n === step ? " is-on" : ""}`} aria-label={t.wizard.goTo(n, s.short)} aria-current={n === step ? "step" : undefined} onClick={() => go(n)}>
                <span className="wz-track">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="wz-seg-label">{s.short}</span>
              </button>
            );
          })}
        </div>
        <div className="wz-controls">
          <button type="button" className="icon-button" aria-label={t.wizard.prev} onClick={() => go(step === 1 ? steps.length : step - 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="icon-button wz-toggle" aria-label={playing ? t.wizard.pause : t.wizard.play} onClick={() => setPlaying(!playing)}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="icon-button" aria-label={t.wizard.next} onClick={() => go((step % steps.length) + 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
