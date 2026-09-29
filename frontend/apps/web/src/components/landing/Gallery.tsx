// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useId, useRef, useState } from "react";
import { t } from "../../i18n";
import { ChevronLeftIcon, CloseIcon } from "../Icons";
import { Shot, isPhoneShot, type ShotName } from "./Shot";

/** The gallery's pictures, in order: the website, the device's window, then the app. */
export type GalleryName = keyof typeof t.gallery.items & ShotName;
export const GALLERY: GalleryName[] = ["web-device", "web-roms", "web-room", "web-invite", "win-overview", "app-home", "app-pin", "app-room", "app-chat"];

/** Pictures shown two columns wide (the website's pages). */
const WIDE = new Set<GalleryName>(["web-device", "web-roms", "web-room"]);

/** "Web · …", "Computer · …" or "App · …": where the picture comes from. */
export function galleryCaption(name: GalleryName): string {
  const g = t.gallery;
  const group = name.startsWith("web-") ? g.web : name.startsWith("win-") ? g.computer : g.app;
  return `${group} · ${g.items[name].caption}`;
}

function galleryAlt(name: GalleryName): string {
  return t.gallery.items[name].alt;
}

/**
 * "This is how it looks": real screenshots with captions. A thumbnail opens
 * the picture large in a modal dialog (a native <dialog>: focus stays in it,
 * Esc closes it, the arrow keys go to the previous and next picture, and
 * focus goes back to the thumbnail).
 */
export function Gallery() {
  const g = t.gallery;
  const [open, setOpen] = useState<number | null>(null);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const last = useRef(0);
  // Back to the thumbnail once the dialog is closed (while a modal dialog
  // is open the rest of the page cannot take focus).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open === null && wasOpen.current) thumbs.current[last.current]?.focus();
    wasOpen.current = open !== null;
  }, [open]);
  const close = () => setOpen(null);
  return (
    <div className="lp-gallery-wrap">
      <div className="lp-gallery-head">
        <h3 className="lp-h3 lp-gallery-title">{g.title}</h3>
        <span className="small muted">{g.note}</span>
      </div>
      <ul className="lp-gallery">
        {GALLERY.map((name, i) => (
          <li key={name} className={WIDE.has(name) ? "is-wide" : undefined}>
            <figure className="lp-thumb">
              <button
                type="button"
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                className={`lp-thumb-button${isPhoneShot(name) ? " is-phone" : ""}`}
                aria-label={g.open(galleryCaption(name))}
                onClick={() => {
                  last.current = i;
                  setOpen(i);
                }}
              >
                <Shot name={name} alt={galleryAlt(name)} />
              </button>
              <figcaption className="small-plus">{galleryCaption(name)}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox index={open} onGo={setOpen} onClose={close} />}
    </div>
  );
}

function Lightbox({ index, onGo, onClose }: { index: number; onGo: (i: number) => void; onClose: () => void }) {
  const g = t.gallery;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const name = GALLERY[index]!;
  const count = GALLERY.length;
  const prev = () => onGo((index + count - 1) % count);
  const next = () => onGo((index + 1) % count);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // jsdom and old browsers have no showModal: the open attribute still shows it.
    if (typeof d.showModal === "function") {
      if (!d.open) d.showModal();
    } else d.setAttribute("open", "");
    return () => {
      if (typeof d.close === "function" && d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="lp-lightbox"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          prev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          next();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lp-lightbox-body">
        <div className="lp-lightbox-head">
          <h2 id={titleId} className="lp-h3">
            {galleryCaption(name)}
          </h2>
          <span className="small muted">{g.counter(index + 1, count)}</span>
          <button type="button" className="icon-button tip-below" aria-label={g.close} data-tip={g.close} onClick={onClose} autoFocus>
            <CloseIcon />
          </button>
        </div>
        <div className={`lp-lightbox-picture${isPhoneShot(name) ? " is-phone" : ""}`}>
          <Shot key={name} name={name} alt={galleryAlt(name)} eager />
        </div>
        <div className="lp-lightbox-nav">
          <button type="button" className="icon-button" aria-label={g.prev} data-tip={g.prev} onClick={prev}>
            <ChevronLeftIcon />
          </button>
          <button type="button" className="icon-button lp-next" aria-label={g.next} data-tip={g.next} onClick={next}>
            <ChevronLeftIcon />
          </button>
        </div>
      </div>
    </dialog>
  );
}
