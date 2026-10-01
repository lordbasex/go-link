// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { lazy, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { t, useLang } from "../i18n";

// The module is its own chunk, loaded only when this page opens.
const WillyMakerApp = lazy(() => import("../willy-maker").then((m) => ({ default: m.WillyMakerApp })));

/** /tools/willy-maker[/:gameId]: Willy Maker, the arcade game maker. */
export function WillyMakerPage() {
  const lang = useLang();
  const { gameId } = useParams();
  const navigate = useNavigate();
  return (
    <Suspense fallback={<p className="page page-frame">{t.tools.makerLoading}</p>}>
      <WillyMakerApp lang={lang} projectId={gameId ?? null} onProjectId={(id) => navigate(id ? `/tools/willy-maker/${id}` : "/tools/willy-maker")} />
    </Suspense>
  );
}
