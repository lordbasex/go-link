// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { lazy, Suspense, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { t, useLang } from "../i18n";
import { useSignal } from "../signal/SignalProvider";
import type { MakerDevice } from "../willy-maker";

// The module is its own chunk, loaded only when this page opens.
const WillyMakerApp = lazy(() => import("../willy-maker").then((m) => ({ default: m.WillyMakerApp })));

/** /tools/willy-maker[/:gameId]: Willy Maker, the arcade game maker. */
export function WillyMakerPage() {
  const lang = useLang();
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { hostLink, linkedDevice, savedLink, onDeviceMessage } = useSignal();
  // The linked device, for the ROM test on it (validation level 4).
  const online = hostLink !== null && linkedDevice.state === "connected";
  const name = linkedDevice.status?.system?.hardware.hostname;
  const device = useMemo<MakerDevice>(
    () => ({
      linked: hostLink !== null || savedLink !== null,
      link: online ? hostLink.stream : null,
      onMessage: onDeviceMessage,
      name,
      openMyDevice: () => navigate("/device"),
      openRoom: (roomId) => navigate(`/r/${roomId}`),
    }),
    [hostLink, savedLink, online, onDeviceMessage, name, navigate],
  );
  return (
    <Suspense fallback={<p className="page page-frame">{t.tools.makerLoading}</p>}>
      <WillyMakerApp lang={lang} device={device} projectId={gameId ?? null} onProjectId={(id) => navigate(id ? `/tools/willy-maker/${id}` : "/tools/willy-maker")} />
    </Suspense>
  );
}
