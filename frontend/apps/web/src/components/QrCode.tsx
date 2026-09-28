// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * A QR code of text, drawn as SVG squares by React (the library only says
 * which modules are dark). Dark modules on a light background with a quiet
 * zone, so phone cameras read it even in the dark theme.
 */
export function QrCode({ text, label, size = 200 }: { text: string; label: string; size?: number }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const dark: [number, number][] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) dark.push([c, r]);
    return { n, dark };
  }, [text]);
  const quiet = 4;
  const view = cells.n + quiet * 2;
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${view} ${view}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={view} height={view} fill="#fff" />
      <path fill="#000" d={cells.dark.map(([x, y]) => `M${x + quiet} ${y + quiet}h1v1h-1z`).join("")} />
    </svg>
  );
}
