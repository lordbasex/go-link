// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Loading placeholders in the shape of what is coming (atoms of the design
// system): grey blocks with a soft shimmer, hidden from screen readers,
// which hear the status text instead.

/** One grey block. */
export function Skeleton({ width, height = 14, round = false }: { width?: number | string; height?: number | string; round?: boolean }) {
  return <span className={`skeleton${round ? " is-round" : ""}`} style={{ width, height }} aria-hidden="true" />;
}

/** Rows of a list or table while it loads. */
export function SkeletonRows({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <Skeleton width={44} height={44} />
          <div className="skeleton-lines">
            <Skeleton width={`${50 - (i % 3) * 8}%`} height={14} />
            <Skeleton width={`${30 + (i % 2) * 10}%`} height={11} />
          </div>
          <Skeleton width={80} height={22} round />
          <Skeleton width={110} height={14} />
          <Skeleton width={36} height={36} round />
        </div>
      ))}
    </div>
  );
}

/** Cards of a grid while it loads. */
export function SkeletonCards({ cards = 6, label, tall = false }: { cards?: number; label: string; tall?: boolean }) {
  return (
    <div className={`skeleton-cards${tall ? " is-tall" : ""}`} role="status" aria-label={label}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="skeleton-card" aria-hidden="true">
          <Skeleton width="100%" height={tall ? 180 : 110} />
          <div className="skeleton-lines">
            <Skeleton width="70%" height={15} />
            <Skeleton width="45%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The shape of the My device dashboard: hero, tabs and figure cards. */
export function SkeletonDashboard({ label }: { label: string }) {
  return (
    <div className="dash" role="status" aria-label={label}>
      <div className="skeleton-hero" aria-hidden="true">
        <Skeleton width={72} height={72} />
        <div className="skeleton-lines">
          <Skeleton width={110} height={12} />
          <Skeleton width="min(420px, 70%)" height={36} />
          <div className="skeleton-chips">
            <Skeleton width={130} height={28} round />
            <Skeleton width={150} height={28} round />
            <Skeleton width={200} height={28} round />
          </div>
        </div>
      </div>
      <div className="skeleton-chips" aria-hidden="true">
        <Skeleton width={96} height={20} />
        <Skeleton width={80} height={20} />
        <Skeleton width={90} height={20} />
      </div>
      <SkeletonCards cards={4} label="" />
    </div>
  );
}
