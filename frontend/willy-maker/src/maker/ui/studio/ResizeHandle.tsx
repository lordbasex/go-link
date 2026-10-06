// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The 8 px strip on a side panel's inner edge: dragged with the mouse (or
// moved with the arrow keys when focused) it changes the panel's width.
// While dragging, the whole page shows the resize cursor.

import { useStudioText } from "../../i18n";
import { LEFT_MAX, LEFT_MIN, RIGHT_MAX, RIGHT_MIN, useStudioUi } from "./state";

export function ResizeHandle({ side, width }: { side: "left" | "right"; width: number }) {
  const t = useStudioText();
  const ui = useStudioUi();
  const apply = (w: number) => (side === "left" ? ui.dragLeft(w) : ui.dragRight(w));

  // the listeners go on the window: the strip itself is replaced when the panel turns into the rail or back
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    document.body.style.cursor = "col-resize";
    const move = (ev: PointerEvent) => apply(side === "left" ? w0 + (ev.clientX - x0) : w0 - (ev.clientX - x0));
    const up = () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow) apply(width + step);
    else if (e.key === shrink) apply(width - step);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className={`studio-resize is-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resize}
      aria-valuemin={side === "left" ? LEFT_MIN : RIGHT_MIN}
      aria-valuemax={side === "left" ? LEFT_MAX : RIGHT_MAX}
      aria-valuenow={width}
      title={t.resize}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
