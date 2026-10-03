// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Willy Maker's own line icons (24 × 24, currentColor), so the module needs
// nothing from the site's components.

import type { ReactNode } from "react";

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const IconUndo = () => (
  <Svg>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Svg>
);
export const IconRedo = () => (
  <Svg>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Svg>
);
export const IconPlay = () => (
  <Svg>
    <path d="M7 4v16l13-8z" fill="currentColor" />
  </Svg>
);
export const IconSound = () => (
  <Svg>
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </Svg>
);
export const IconSoundOff = () => (
  <Svg>
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
    <path d="M16 9l6 6M22 9l-6 6" />
  </Svg>
);
export const IconPause = () => (
  <Svg>
    <path d="M8 5v14M16 5v14" />
  </Svg>
);
export const IconSelect = () => (
  <Svg>
    <path d="m5 3 14 8-6 2-3 6z" />
  </Svg>
);
export const IconPencil = () => (
  <Svg>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13 7 4 4" />
  </Svg>
);
export const IconEraser = () => (
  <Svg>
    <path d="m7 21-4-4L14 6l6 6-9 9z" />
    <path d="M7 21h13" />
  </Svg>
);
export const IconFill = () => (
  <Svg>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="8" y="8" width="8" height="8" fill="currentColor" />
  </Svg>
);
export const IconHand = () => (
  <Svg>
    <path d="M8 12V5a1.5 1.5 0 0 1 3 0v6" />
    <path d="M11 10V4a1.5 1.5 0 0 1 3 0v6" />
    <path d="M14 10V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 14" />
  </Svg>
);
export const IconEye = () => (
  <Svg>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconEyeOff = () => (
  <Svg>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.6M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a10 10 0 0 0 4.4-1" />
  </Svg>
);
export const IconLock = () => (
  <Svg>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);
export const IconUnlock = () => (
  <Svg>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </Svg>
);
export const IconUp = () => (
  <Svg>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);
export const IconDown = () => (
  <Svg>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const IconPlus = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconTrash = () => (
  <Svg>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);
export const IconUpload = () => (
  <Svg>
    <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
  </Svg>
);
export const IconDownload = () => (
  <Svg>
    <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />
  </Svg>
);
export const IconZoomIn = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4M8 11h6M11 8v6" />
  </Svg>
);
export const IconZoomOut = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4M8 11h6" />
  </Svg>
);
export const IconBack = () => (
  <Svg>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconDots = () => (
  <Svg>
    <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" />
  </Svg>
);
export const IconWarn = () => (
  <Svg size={16}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17v.5" />
  </Svg>
);
export const IconCheck = () => (
  <Svg size={16}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);
export const IconX = () => (
  <Svg size={16}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconInfo = () => (
  <Svg size={16}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </Svg>
);
export const IconCopy = () => (
  <Svg>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </Svg>
);
export const IconCircle = () => (
  <Svg size={16}>
    <circle cx="12" cy="12" r="7" />
  </Svg>
);
export const IconMic = () => (
  <Svg size={16}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);
export const IconStop = () => (
  <Svg size={16}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </Svg>
);
export const IconSparkle = () => (
  <Svg size={16}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </Svg>
);
