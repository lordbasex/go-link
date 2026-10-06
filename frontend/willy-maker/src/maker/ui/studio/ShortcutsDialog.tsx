// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Keyboard shortcuts" (?): the shortcut table (keys.ts) grouped as the
// editor works: tools, view, panels, edit, play and help, with keycaps.

import { useEffect, useRef } from "react";
import { useStudioText } from "../../i18n";
import { SHORTCUT_GROUPS, SHORTCUTS } from "./keys";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useStudioText();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  return (
    <div className="mdn-backdrop studio-keys-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="studio-keys" role="dialog" aria-modal="true" aria-labelledby="studio-keys-title">
        <div className="studio-keys-head">
          <div className="studio-keys-titles">
            <span className="studio-dialog-kicker">{t.keys.kicker}</span>
            <h2 id="studio-keys-title" className="studio-dialog-title">
              {t.keys.title}
            </h2>
          </div>
          <button ref={close} type="button" className="btn btn-secondary" onClick={onClose}>
            {t.keys.close}
          </button>
        </div>
        <div className="studio-keys-grid">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g} className="studio-keys-group" aria-label={t.keys.groups[g]}>
              <h3>{t.keys.groups[g]}</h3>
              <dl>
                {SHORTCUTS.filter((r) => r.group === g)
                  .map((r) => ({ label: t.keys.items[r.item], keys: r.keys(t.keys.names) }))
                  .filter((r) => r.keys.length)
                  .map((r, i) => (
                    <div key={i} className="studio-keys-row">
                      <dt>{r.label}</dt>
                      <dd>
                        {r.keys.map((k, j) => (
                          <kbd key={j} className="keycap">
                            {k}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
