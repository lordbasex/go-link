// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BridgeClient, useBridgeDevice } from "./bridge";
import { importGames } from "./importGames";
import { CORE, messagesFor, type Lang } from "./maker/i18n";
import { LANGS, PLAY_URL, setLang, setTheme, SITE_URL, useLang, useTheme } from "./site";

// The module is its own chunk: the header shows while it loads.
const WillyMakerApp = lazy(() => import("./maker").then((m) => ({ default: m.WillyMakerApp })));

const LANG_LABEL: Record<Lang, string> = { en: "EN", es: "ES", pt: "PT" };

/** The go-link mark, as on go-link.org. */
function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" strokeWidth="2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="11" rx="5.5" />
      <path d="M7 11v3M5.5 12.5h3" />
      <circle cx="16" cy="11.5" r="1.2" />
      <circle cx="18.2" cy="13.8" r="1.2" />
    </svg>
  );
}

function Header({ lang }: { lang: Lang }) {
  const t = messagesFor(CORE, lang).site;
  const theme = useTheme();
  return (
    <header className="maker-header">
      <a className="maker-brand" href="/">
        <Mark />
        <span className="maker-brand-name">Willy Maker</span>
      </a>
      <a className="maker-by" href={SITE_URL}>
        {t.by}
      </a>
      <span className="maker-spacer" />
      <div className="maker-langs" role="group" aria-label={t.language}>
        {LANGS.map((l) => (
          <button key={l} type="button" className={l === lang ? "is-on" : undefined} aria-pressed={l === lang} onClick={() => setLang(l)}>
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="maker-theme"
        aria-label={theme === "light" ? t.darkTheme : t.lightTheme}
        data-tip={theme === "light" ? t.darkTheme : t.lightTheme}
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      >
        {theme === "light" ? "☾" : "☀"}
      </button>
    </header>
  );
}

/**
 * Offers once to bring the games made while Willy Maker lived on go-link.org
 * (?import=1 from its old address). They are in the landing's storage, so
 * they come through the landing's bridge tab, not the rooms' one.
 */
function ImportBanner({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const t = messagesFor(CORE, lang).site;
  const client = useMemo(() => new BridgeClient(SITE_URL), []);
  useEffect(() => client.start(), [client]);
  const [state, setState] = useState<"ask" | "busy" | number>("ask");
  const start = () => {
    setState("busy");
    client.importOldGames((games) => {
      void importGames(games).then((n) => setState(n));
    });
  };
  return (
    <section className="maker-import" role="status">
      <strong>{t.importTitle}</strong>
      {typeof state === "number" ? (
        <>
          <span>{t.imported(state)}</span>
          <button type="button" className="maker-button" onClick={() => window.location.assign("/")}>
            OK
          </button>
        </>
      ) : (
        <>
          <span>{t.importText}</span>
          <button type="button" className="maker-button is-primary" disabled={state === "busy"} onClick={start}>
            {state === "busy" ? t.importing : t.importButton}
          </button>
          <button type="button" className="maker-button" onClick={onDone}>
            {t.dismiss}
          </button>
        </>
      )}
    </section>
  );
}

export function App() {
  const lang = useLang();
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const client = useMemo(() => new BridgeClient(PLAY_URL), []);
  useEffect(() => client.start(), [client]);
  const device = useBridgeDevice(client);
  const t = messagesFor(CORE, lang).site;
  return (
    <>
      <Header lang={lang} />
      {search.get("import") === "1" && <ImportBanner lang={lang} onDone={() => setSearch({})} />}
      <main className="maker-main">
        <Suspense fallback={<p className="maker-loading">{t.loading}</p>}>
          <WillyMakerApp lang={lang} device={device} projectId={gameId ?? null} onProjectId={(id) => navigate(id ? `/${id}` : "/")} />
        </Suspense>
      </main>
    </>
  );
}
