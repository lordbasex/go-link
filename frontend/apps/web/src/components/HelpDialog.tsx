// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";
import { t } from "../i18n";

/** "How to play": every control of a room, explained in one place. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" || e.code === "Escape") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="dialog-title">
          {t.help.title}
        </h2>
        <p className="muted">{t.help.intro}</p>
        <div className="help-sections">
          {t.help.sections.map((section) => (
            <section key={section.title} className="help-section">
              <h3 className="help-section-title">{section.title}</h3>
              <ul className="help-list">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="small muted">
          <Link to="/test-controller" className="text-link" onClick={onClose}>
            {t.testController.link}
          </Link>{" "}
          · {t.testController.linkHint}
        </p>
        <div className="dialog-actions">
          <button ref={closeRef} type="button" className="button button-primary" onClick={onClose}>
            {t.help.close}
          </button>
        </div>
      </div>
    </div>
  );
}
