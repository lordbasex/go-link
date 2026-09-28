// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { ReactNode } from "react";

// The building blocks every page shares (atomic design): a chip (atom), the
// page's picture tile (atom) and the hero that opens each page (molecule),
// all in the style of My device.

/** A small rounded label; "live" glows in the voice color. */
export function Chip({
  children,
  tone,
  dot = false,
  mono = false,
  title,
  className = "",
}: {
  children: ReactNode;
  tone?: "live" | "danger";
  dot?: boolean;
  mono?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span className={`dash-chip${tone ? ` is-${tone}` : ""}${mono ? " mono" : ""}${className ? ` ${className}` : ""}`} title={title}>
      {dot && <span className="dash-chip-dot" />}
      {children}
    </span>
  );
}

/** The square picture of a page: an icon or an image, with a status dot. */
export function HeroTile({
  children,
  art,
  status,
}: {
  children?: ReactNode;
  /** An image URL shown instead of the icon. */
  art?: string | null;
  status?: "live" | "failed" | "idle";
}) {
  return (
    <div className={`hero-tile${art ? " has-art" : ""}`}>
      {art ? <img src={art} alt="" /> : children}
      {status && (
        <span className={`dash-device-dot${status === "live" ? " is-live" : status === "failed" ? " is-failed" : ""}`} />
      )}
    </div>
  );
}

/**
 * The top of a page: tile, eyebrow, big title, a line of text, chips, and
 * the page's actions on the right.
 */
export function PageHero({
  tile,
  eyebrow,
  title,
  subtitle,
  chips,
  actions,
  className = "",
}: {
  tile?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dash-hero page-hero ${className}`.trim()}>
      <div className="dash-hero-id">
        {tile}
        <div className="stack-xs hero-text">
          {eyebrow && <span className="eyebrow eyebrow-accent hero-eyebrow">{eyebrow}</span>}
          <h1 className="dash-title">{title}</h1>
          {subtitle && <p className="muted hero-subtitle">{subtitle}</p>}
          {chips && <div className="dash-chips">{chips}</div>}
        </div>
      </div>
      {actions && <div className="dash-hero-actions">{actions}</div>}
    </section>
  );
}
