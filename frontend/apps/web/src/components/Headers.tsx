// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
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
import { CoinIcon, CoinOffIcon, GithubIcon } from "./Icons";
import { setStartupSound, useStartupSound } from "../intro";
import { REPO_URL } from "../config";

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label={t.brand.home}>
      <span className="brand-mark">
        <GamepadIcon />
      </span>
      <span className="brand-name">
        {t.brand.name}
        <span className="accent">{t.brand.dot}</span>
        {t.brand.suffix}
      </span>
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

/** Three round language bubbles (EN, ES, PT). The change applies at once,
 * without reloading, so a running game is never cut. */
export function LangSwitch() {
  const lang = useLang();
  return (
    <div className="lang-switch" role="group" aria-label={t.lang.label}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id}
          className={`lang-bubble${l.id === lang ? " is-active" : ""}`}
          aria-pressed={l.id === lang}
          aria-label={l.name}
          title={l.name}
          onClick={() => setLang(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function MainHeader() {
  const { panel } = useSignal();
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " is-active" : ""}`;
  // On phones the tools fold behind one button and the sections become a
  // tab bar at the bottom of the screen, as in a phone app.
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
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
    <header className="app-header app-header-main">
      <div className="header-left">
        <Brand />
        <nav aria-label={t.nav.label} className="main-nav">
          {/* The device's own panel is for managing it: no landing page. */}
          {!panel && (
            <NavLink to="/" end className={navClass}>
              <HelpIcon />
              <span>{t.nav.howItWorks}</span>
            </NavLink>
          )}
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
        </nav>
      </div>
      <div className="header-right" ref={toolsRef}>
        <DeviceBadge />
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
          <LangSwitch />
          <ServerButton />
          <ThemeButton />
          <StartupSoundButton />
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
 * The startup intro's coin sound, on or off. It sits with the other
 * per-browser preferences (language, theme) in the header's tools.
 */
export function StartupSoundButton() {
  const on = useStartupSound();
  const tip = on ? t.intro.on : t.intro.off;
  return (
    <button
      type="button"
      className="icon-button header-icon tip-below"
      aria-label={t.intro.sound}
      aria-pressed={on}
      data-tip={tip}
      onClick={() => setStartupSound(!on)}
    >
      {on ? <CoinIcon /> : <CoinOffIcon />}
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
