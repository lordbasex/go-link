// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { ExitFullscreenIcon, FullscreenIcon, PictureIcon } from "../components/Icons";
import { HeroTile, PageHero } from "../components/ui/PageHero";
import { PictureFields } from "../components/PictureControl";
import { useFullscreen } from "../components/useFullscreen";
import { PictureCanvas } from "@go-link/ui/picture";
import { SplitDivider } from "../picture/SplitDivider";
import { useRefreshRate } from "@go-link/ui/picture";
import type { RendererKind } from "@go-link/ui/picture";
import { usePictureSettings } from "@go-link/ui/picture";
import { CARD_ASPECT, CARD_H, CARD_W, drawTestCard } from "@go-link/ui/picture";

/**
 * /picture-demo: the picture styles side by side on a synthetic arcade
 * frame (a test card with moving sprites drawn at 384 x 224), no device
 * needed. The left of the line is the browser's usual look, the right the
 * chosen style and sides; the choice is the same one the rooms use.
 */
export function PictureDemoPage() {
  const [settings, setSettings] = usePictureSettings();
  const [split, setSplit] = useState(0.5);
  const [renderer, setRenderer] = useState<RendererKind | null | undefined>(undefined);
  const hz = useRefreshRate();
  const stageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(stageRef);
  const cardRef = useRef<HTMLCanvasElement | null>(null);
  if (!cardRef.current && typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = CARD_W;
    c.height = CARD_H;
    c.className = "picture-fallback";
    cardRef.current = c;
  }

  // The test card moves at the screen's pace; nothing runs while hidden.
  useEffect(() => {
    const card = cardRef.current;
    const ctx = card?.getContext("2d");
    if (!card || !ctx) return;
    let frame = 0;
    const tick = (now: number) => {
      drawTestCard(ctx, now);
      frame = requestAnimationFrame(tick);
    };
    drawTestCard(ctx, performance.now());
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Without WebGL the card itself is shown, stretched by the browser.
  useEffect(() => {
    const card = cardRef.current;
    const stage = stageRef.current;
    if (renderer !== null || !card || !stage) return;
    stage.prepend(card);
    return () => card.remove();
  }, [renderer]);

  const rendererText =
    renderer === "webgl2" ? "WebGL 2" : renderer === "webgl" ? "WebGL 1" : renderer === null ? t.picture.rendererOff : "–";
  return (
    <div className="page page-frame picture-demo-page">
      <PageHero
        tile={
          <HeroTile>
            <PictureIcon size={30} />
          </HeroTile>
        }
        eyebrow={t.picture.demoEyebrow}
        title={t.picture.demoTitle}
        subtitle={t.picture.demoIntro}
      />
      <div className="page-body picture-demo">
        <div
          ref={stageRef}
          className={`picture-demo-stage stage-tokens${fullscreen.active ? " is-fullscreen" : ""}${fullscreen.pseudo ? " is-pseudo-fullscreen" : ""}`}
          data-renderer={renderer ?? (renderer === null ? "none" : "pending")}
        >
          {renderer !== null && (
            <div className="picture-layer">
              <PictureCanvas
                source={cardRef}
                aspect={CARD_ASPECT}
                style={settings.style}
                bands={settings.bands}
                split={split}
                onRenderer={setRenderer}
              />
              <SplitDivider value={split} onChange={setSplit} after={t.picture.styles[settings.style]} />
            </div>
          )}
          <button
            type="button"
            className="icon-button picture-demo-fs"
            aria-pressed={fullscreen.active}
            aria-label={fullscreen.active ? t.picture.exitFullscreen : t.picture.fullscreen}
            data-tip={fullscreen.active ? t.picture.exitFullscreen : t.picture.fullscreen}
            onClick={() => fullscreen.toggle()}
          >
            {fullscreen.active ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
        <div className="picture-demo-bar">
          <PictureFields settings={settings} onChange={setSettings} idPrefix="demo-picture" />
        </div>
        {renderer === null && <p className="small muted">{t.picture.unavailable}</p>}
        <p className="picture-demo-facts small muted">
          <span>{t.picture.demoSource}</span>
          <span>
            {t.picture.screen}: <span className="mono">{hz === null ? "–" : t.picture.hz(hz)}</span>
          </span>
          <span>
            {t.picture.renderer}: <span className="mono">{rendererText}</span>
          </span>
        </p>
      </div>
    </div>
  );
}
