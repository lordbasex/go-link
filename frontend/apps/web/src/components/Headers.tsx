// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LANGS, setLang, t, useLang } from "../i18n";
import { useSignal } from "../signal/SignalProvider";
import { DEMO_DEVICE_NAME } from "../fixtures";
import {
  BookIcon,
  GamepadIcon,
  HelpIcon,
  MonitorIcon,
  MoonIcon,
  MoreIcon,
  ServerIcon,
  SunIcon,
  ToolsIcon,
} from "./Icons";
import { setTheme, useTheme } from "../theme";
import { DevilIcon, GithubIcon } from "./Icons";
import { launchDestroy, prefetchDestroy } from "../destroyLauncher";
import { REPO_URL } from "../config";
import { setHeaderSlot } from "./headerSlot";
import { ROLE, homeHref } from "../role";

export function Brand() {
  const { panel } = useSignal();
  const inner = (
    <>
      <span className="brand-mark">
        <GamepadIcon />
      </span>
      <span className="brand-name">
        {t.brand.name}
        <span className="accent">{t.brand.dot}</span>
        {t.brand.suffix}
      </span>
    </>
  );
  // On the rooms' own site the logo goes to the landing, on its own site.
  return ROLE === "play" && !panel ? (
    <a href={homeHref()} className="brand" aria-label={t.brand.home}>
      {inner}
    </a>
  ) : (
    <Link to="/" className="brand" aria-label={t.brand.home}>
      {inner}
    </Link>
  );
}

/** "Device linked" pill, or "Guest" in a browser with no device of its own. */
export function DeviceBadge() {
  const { hostLink, savedLink, demo, linkedDevice, panel } = useSignal();
  if (!hostLink && !demo) {
    // A remembered device reconnecting, or the panel asking for its token.
    if (savedLink || panel) return null;
    return (
      <div className="pill pill-guest" role="status" title={t.guest.badgeHint}>
        <span className="dot dot-guest" />
        {t.guest.badge}
      </div>
    );
  }
  const name = demo
    ? DEMO_DEVICE_NAME
    : linkedDevice.status?.system?.hardware.hostname?.replace(/\.local$/i, "");
  const label = name ? `${t.device.linked} · ${name}` : t.device.linked;
  return (
    <Link
      to="/device"
      className="icon-button header-icon header-device tip-below"
      aria-label={label}
      data-tip={label}
    >
      <MonitorIcon size={17} />
      <span className="header-device-dot" aria-hidden="true" />
    </Link>
  );
}

export function ServerButton() {
  const { server, setServerDialogOpen } = useSignal();
  return (
    <button
      type="button"
      className={`icon-button header-icon tip-below${server.custom ? " is-warning" : ""}`}
      aria-label={server.custom ? t.server.customBadge : t.server.button}
      data-tip={server.custom ? t.server.customBadge : t.server.button}
      onClick={() => setServerDialogOpen(true)}
    >
      <ServerIcon />
    </button>
  );
}

/** One button with the current language; its menu picks another. The
 * change applies at once, without reloading, so a running game is never cut. */
export function LangMenu() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0]!;
  return (
    <div className="lang-menu-wrap" ref={ref}>
      <button
        type="button"
        className={`icon-button header-icon lang-menu-button tip-below${open ? " is-on" : ""}`}
        aria-label={`${t.lang.label}: ${current.name}`}
        data-tip={open ? undefined : t.lang.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {current.label}
      </button>
      {open && (
        <div className="lang-menu" role="menu" aria-label={t.lang.label}>
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="menuitemradio"
              lang={l.id}
              aria-checked={l.id === lang}
              className={`lang-menu-item${l.id === lang ? " is-active" : ""}`}
              onClick={() => {
                setLang(l.id);
                setOpen(false);
              }}
            >
              <span className="lang-menu-code">{l.label}</span>
              {l.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Stable callbacks, so a header render never empties the slots for a moment.
const infoSlotRef = (el: HTMLDivElement | null) => setHeaderSlot("info", el);
const actionsSlotRef = (el: HTMLDivElement | null) => setHeaderSlot("actions", el);

export function MainHeader() {
  const { panel } = useSignal();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " is-active" : ""}`;
  // On phones the tools fold behind one button and the sections become a
  // tab bar at the bottom of the screen, as in a phone app.
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  // A room keeps only the logo, its own actions (RoomPage puts them in the
  // header slot) and the tools that matter while playing.
  const inRoom = pathname.startsWith("/r/");
  useEffect(() => setToolsOpen(false), [pathname]);
  useEffect(() => {
    if (!toolsOpen) return;
    const away = (e: PointerEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setToolsOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [toolsOpen]);
  return (
    <header className={`app-header app-header-main${inRoom ? " is-room" : ""}`}>
      <div className="header-left">
        <Brand />
        {inRoom && <div className="header-info-slot" ref={infoSlotRef} />}
        {!inRoom && <nav aria-label={t.nav.label} className="main-nav">
          {/* The device's own panel is for managing it: no landing page. */}
          {!panel &&
            (ROLE === "play" ? (
              <a href={homeHref()} className={navClass({ isActive: false })}>
                <HelpIcon />
                <span>{t.nav.howItWorks}</span>
              </a>
            ) : (
              <NavLink to="/" end className={navClass}>
                <HelpIcon />
                <span>{t.nav.howItWorks}</span>
              </NavLink>
            ))}
          <NavLink to="/rooms" className={navClass}>
            <GamepadIcon size={18} />
            <span>{t.nav.rooms}</span>
          </NavLink>
          <NavLink to="/device" className={navClass}>
            <MonitorIcon size={18} />
            <span>{t.nav.myDevice}</span>
          </NavLink>
          <NavLink to="/docs" className={navClass}>
            <BookIcon />
            <span>{t.nav.docs}</span>
          </NavLink>
          <NavLink to="/tools" className={navClass}>
            <ToolsIcon />
            <span>{t.tools.nav}</span>
          </NavLink>
        </nav>}
      </div>
      <div className="header-right" ref={toolsRef}>
        {inRoom && <div className="header-slot" ref={actionsSlotRef} />}
        {/* The landing keeps no link to a device and never connects. */}
        {ROLE !== "site" && <DeviceBadge />}
        {/* Always in sight (not folded into the tools on phones): it wants to be found. */}
        <DevilButton />
        <LangMenu />
        <button
          type="button"
          className={`icon-button header-more${toolsOpen ? " is-on" : ""}`}
          aria-expanded={toolsOpen}
          aria-label={t.nav.tools}
          onClick={() => setToolsOpen(!toolsOpen)}
        >
          <MoreIcon />
        </button>
        <div className={`header-tools${toolsOpen ? " is-open" : ""}`}>
          {ROLE !== "site" && <ServerButton />}
          <ThemeButton />
          <a
            className="icon-button tip-below"
            href={REPO_URL}
            target="_blank"
            rel="noopener"
            aria-label={t.legal.footer.github}
            data-tip={t.legal.footer.github}
          >
            <GithubIcon />
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * The devil: an easter egg that turns the landing into a game where you
 * destroy the page and rescue the people trapped in it. It wiggles now and
 * then to be noticed, and it only lives on the landing ("/"): the game is
 * that page's easter egg, so no other page shows it.
 */
export function DevilButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname !== "/") return null;
  return (
    <button
      type="button"
      className="icon-button header-icon tip-below devil-button"
      aria-label={t.destroy.devil}
      data-tip={t.destroy.devil}
      onClick={() => void launchDestroy(pathname, navigate)}
      // The game and its characters start downloading as the pointer or the focus arrives.
      onPointerEnter={prefetchDestroy}
      onFocus={prefetchDestroy}
    >
      <span className="devil-ring" aria-hidden="true" />
      <DevilIcon />
    </button>
  );
}

/** Dark (default) or light: the icon shows the theme a press switches to. */
export function ThemeButton() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? t.theme.toLight : t.theme.toDark;
  return (
    <button
      type="button"
      className="icon-button header-icon tip-below"
      aria-label={label}
      data-tip={label}
      onClick={() => setTheme(next)}
    >
      {next === "light" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
