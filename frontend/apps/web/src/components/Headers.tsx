// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Link, NavLink } from "react-router-dom";
import { LANGS, setLang, t, useLang } from "../i18n";
import { useSignal } from "../signal/SignalProvider";
import { DEMO_DEVICE_NAME } from "../fixtures";
import { GamepadIcon, MonitorIcon, MoonIcon, ServerIcon, SunIcon } from "./Icons";
import { setTheme, useTheme } from "../theme";
import { GithubIcon } from "./Icons";
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
  return (
    <header className="app-header app-header-main">
      <div className="header-left">
        <Brand />
        <nav aria-label={t.nav.label} className="main-nav">
          {/* The device's own panel is for managing it: no landing page. */}
          {!panel && (
            <NavLink to="/" end className={navClass}>
              {t.nav.howItWorks}
            </NavLink>
          )}
          <NavLink to="/rooms" className={navClass}>
            {t.nav.rooms}
          </NavLink>
          <NavLink to="/device" className={navClass}>
            {t.nav.myDevice}
          </NavLink>
        </nav>
      </div>
      <div className="header-right">
        <LangSwitch />
        <ServerButton />
        <DeviceBadge />
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
    </header>
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
