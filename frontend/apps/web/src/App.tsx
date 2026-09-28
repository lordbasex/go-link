// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { CustomServerBanner, ServerDialog } from "./components/ServerSettings";
import { MainHeader } from "./components/Headers";
import { useSignal } from "./signal/SignalProvider";
import { SPLASH_MAX_MS, SPLASH_MIN_MS, hideSplash } from "./splash";
import { LobbyPage, readRoomsView } from "./pages/LobbyPage";
// The lobby shows the join form to guests, so it comes with the lobby.
import { GuestJoinPage } from "./pages/GuestJoinPage";
import { prefetchThumbnails } from "./components/device/useThumbnail";
// The lobby comes with the first load; the other pages download when
// opened, so a guest joining a room does not get the device dashboard.
const CreateRoomPage = lazy(() =>
  import("./pages/CreateRoomPage").then((m) => ({ default: m.CreateRoomPage })),
);
const RoomPage = lazy(() =>
  import("./pages/RoomPage").then((m) => ({ default: m.RoomPage })),
);
const HowItWorksPage = lazy(() =>
  import("./pages/HowItWorksPage").then((m) => ({ default: m.HowItWorksPage })),
);
const PanelLoginPage = lazy(() =>
  import("./pages/PanelLoginPage").then((m) => ({ default: m.PanelLoginPage })),
);
const DevicePage = lazy(() =>
  import("./pages/DevicePage").then((m) => ({ default: m.DevicePage })),
);
import { LegalPage } from "./pages/LegalPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/**
 * Keeps the logo of index.html up until the first screen can show real
 * data: a guest (nothing to wait for), the owner whose device is off, or
 * the owner whose linked device already sent its status (rooms and
 * library) and the art of its rooms. Never shorter than SPLASH_MIN_MS
 * (branding), never longer than SPLASH_MAX_MS. Without this, the page
 * showed an empty rooms list or the pairing form for a second.
 */
function useSplash() {
  const {
    demo,
    savedLink,
    hostLink,
    deviceOffline,
    linkNotice,
    linkedDevice,
    onDeviceMessage,
  } = useSignal();
  const status = linkedDevice.status;
  const [artReady, setArtReady] = useState(false);
  const prefetched = useRef<unknown>(null);
  useEffect(() => {
    if (!hostLink || !status || prefetched.current === hostLink) return;
    prefetched.current = hostLink;
    const library = status.library;
    const kind = library?.thumbKind ?? "boxart";
    const withArt = new Set(
      library?.roms.filter((r) => r.thumbs[kind]).map((r) => r.name),
    );
    const sets = [...new Set(status.rooms.map((r) => r.rom))]
      .filter((rom) => withArt.has(rom))
      .slice(0, 24);
    void prefetchThumbnails(
      hostLink.stream,
      onDeviceMessage,
      sets,
      kind,
      readRoomsView() === "list" ? "mini" : "card",
    ).then(() => setArtReady(true));
  }, [hostLink, status, onDeviceMessage]);

  const linkedReady = hostLink !== null && status !== null && artReady;
  const known =
    demo ||
    !savedLink ||
    linkedReady ||
    linkedDevice.state === "failed" ||
    deviceOffline ||
    linkNotice !== null;
  const [timeUp, setTimeUp] = useState(
    () => performance.now() >= SPLASH_MIN_MS,
  );
  useEffect(() => {
    const left = SPLASH_MIN_MS - performance.now();
    const minTimer =
      left > 0 ? window.setTimeout(() => setTimeUp(true), left) : undefined;
    const maxTimer = window.setTimeout(
      hideSplash,
      Math.max(0, SPLASH_MAX_MS - performance.now()),
    );
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, []);
  useEffect(() => {
    if (known && timeUp) hideSplash();
  }, [known, timeUp]);
}

export function App() {
  useSplash();
  const { panel, savedLink, hostLink } = useSignal();
  // The device's local panel asks for its token before anything else.
  const needsToken = panel && !savedLink && !hostLink;
  return (
    <>
      <CustomServerBanner />
      {/* One header for every page: it stays put while the page changes. */}
      <MainHeader />
      {/* The one main landmark: every page renders inside it. */}
      <main className="app-main">
      <Suspense fallback={<div className="page" aria-busy="true" />}>
        {needsToken ? (
          <PanelLoginPage />
        ) : (
          <Routes>
            {/* The home page is the landing; a device's local panel opens on its rooms. */}
            {/* The device's local panel has no landing: it opens on the
                device until it is linked, then on its rooms. */}
            <Route path="/" element={panel ? <Navigate to={savedLink || hostLink ? "/rooms" : "/device"} replace /> : <HowItWorksPage />} />
            <Route path="/rooms" element={<LobbyPage />} />
            <Route path="/how-it-works" element={<Navigate to="/" replace />} />
            <Route path="/create" element={<CreateRoomPage />} />
            <Route path="/r/:roomId" element={<RoomPage />} />
            {/* An invitation: /g/<invite> from a link or QR, or /g/<code>. */}
            <Route path="/g/:invite" element={<RoomPage />} />
            <Route path="/g" element={<GuestJoinPage />} />
            <Route path="/device" element={<DevicePage />} />
            {/* Rooms moved to the home page. */}
            <Route path="/device/rooms" element={<Navigate to="/rooms" replace />} />
            <Route path="/device/roms" element={<DevicePage tab="roms" />} />
            <Route
              path="/device/history"
              element={<DevicePage tab="history" />}
            />
            <Route path="/terms" element={<LegalPage doc="terms" />} />
            <Route path="/privacy" element={<LegalPage doc="privacy" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        )}
      </Suspense>
      </main>
      <ServerDialog />
    </>
  );
}
