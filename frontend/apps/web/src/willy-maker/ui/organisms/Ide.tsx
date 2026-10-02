// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The IDE around one open game: the top bar (level, board, save state, the
// Build / Characters / Game / Menus / Export tabs, undo, redo and Play),
// the Build screen with its canvas and panels, and the other tabs.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCore } from "../../i18n";
import { cloneProject, findLevel, type LevelObject, type Project, type ValidationIssue } from "../../model";
import type { LevelView } from "../../engine";
import { layoutOf } from "../../board/cps1";
import { EditorStore } from "../../editor/store";
import { reachability } from "../../editor/reach";
import { applyPlayEdit, deleteObject, type PlayModeEdit } from "../../editor/ops";
import { partById } from "../../editor/parts";
import { gameIssues } from "../../editor/validate/game";
import type { Target } from "../../editor/validate";
import type { MenuScreenId } from "../../game/menus";
import { menuText } from "../../game/menus";
import { playerSlots, runTapMs } from "../../game/settings";
import { issueText, useGameText, useMenusText } from "../../game/texts";
import { autosaver, saveProject } from "../../io/storage";
import { useProjectImages } from "../useTileImages";
import type { View } from "../render";
import { Capsule, IconButton, Logo } from "../atoms";
import { IconBack, IconX, IconEraser, IconFill, IconHand, IconPencil, IconPlay, IconRedo, IconSelect, IconUndo, IconZoomIn, IconZoomOut } from "../icons";
import { TagChip } from "../molecules";
import { clampView, LevelCanvas, MAX_ZOOM, MIN_ZOOM, type Tool } from "./LevelCanvas";
import { Inspector, LayersPanel, MetersPanel, Minimap, PartsPalette, ProjectTree, WarningsPanel } from "./Panels";
import { ExportView } from "./ExportView";

const CharactersScreen = lazy(() => import("../../sprites").then((m) => ({ default: m.CharactersScreen })));
const PlayView = lazy(() => import("../../play").then((m) => ({ default: m.PlayView })));
const GameScreen = lazy(() => import("../../game").then((m) => ({ default: m.GameScreen })));
const MenusScreen = lazy(() => import("../../game").then((m) => ({ default: m.MenusScreen })));
const loadLevelView = () => import("../../engine").then((m) => m.levelFromProject);

type Tab = "build" | "characters" | "game" | "menus" | "export";
type SaveState = "saved" | "saving" | "failed";

/**
 * How much room the Build screen has: the desktop keeps both side panels;
 * a tablet keeps Project and Parts beside the canvas and the rest in a
 * sheet; a phone (narrow, or a landscape phone that is short) gives the
 * canvas the whole screen and keeps every panel in the sheet.
 */
export type IdeMode = "desktop" | "tablet" | "phone";
const PHONE_QUERY = "(max-width: 700px), (max-height: 500px)";
const TABLET_QUERY = "(max-width: 1024px)";

function readMode(): IdeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "desktop";
  if (window.matchMedia(PHONE_QUERY).matches) return "phone";
  return window.matchMedia(TABLET_QUERY).matches ? "tablet" : "desktop";
}

function subscribeMode(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const lists = [window.matchMedia(PHONE_QUERY), window.matchMedia(TABLET_QUERY)];
  lists.forEach((l) => l.addEventListener?.("change", cb));
  return () => lists.forEach((l) => l.removeEventListener?.("change", cb));
}

export function useIdeMode(): IdeMode {
  return useSyncExternalStore(subscribeMode, readMode, () => "desktop");
}

/** The Build screen's sheet on phones and tablets. */
type Sheet = "parts" | "layers" | "inspector" | "project" | "checks";

const TERRAIN_TAGS = ["solid", "oneway", "ladder", "crate", "breakable", "hazard", "water"] as const;

export function Ide({ project, onHome }: { project: Project; onHome: () => void }) {
  const t = useCore();
  const store = useMemo(() => new EditorStore(project), [project]);
  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const p = store.project;
  const [tab, setTab] = useState<Tab>("build");
  const [menuScreen, setMenuScreen] = useState<MenuScreenId>("title");
  const [menuFocus, setMenuFocus] = useState<string | null>(null);
  // the character the Export review's "Go" opens (a new value remounts the screen on it)
  const [charFocus, setCharFocus] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const gt = useGameText();
  const mt = useMenusText();
  const [levelId, setLevelId] = useState(p.levels[0]?.id ?? "");
  const level = findLevel(p, levelId)!;
  const [tool, setTool] = useState<Tool>("pencil");
  const [partId, setPartId] = useState<string>("tag:oneway");
  const [activeLayerId, setActiveLayerId] = useState("collision");
  const [selected, setSelected] = useState<string | null>(null);
  const [cell, setCell] = useState<{ c: number; r: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [autoArt, setAutoArt] = useState(true);
  const [showReach, setShowReach] = useState(true);
  const [showScreen, setShowScreen] = useState(true);
  const [status, setStatus] = useState("");
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<"full" | "blocked" | null>(null);
  const [playing, setPlaying] = useState<{ view: LevelView } | null>(null);
  const [view, setView] = useState<View>(() => ({ x: 0, y: Math.max(0, level.size.h - 300), zoom: 2, w: 900, h: 600 }));
  const images = useProjectImages(p);
  const part = partById(partId) ?? null;
  const mode = useIdeMode();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const ideRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const fit = tab === "build" && mode !== "desktop";

  // phones and tablets: the Build screen fills the screen under the site's header
  useEffect(() => {
    const el = ideRef.current;
    if (!fit || !el) return;
    const place = () => el.style.setProperty("--wm-top", `${Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))}px`);
    window.scrollTo?.(0, 0);
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [fit, mode]);

  // the sheet's panels change with the layout: Project and Parts stay at the side on a tablet
  useEffect(() => {
    if (mode === "desktop" || (mode === "tablet" && (sheet === "parts" || sheet === "project"))) setSheet(null);
  }, [mode, sheet]);

  // the active tab in view when the row scrolls (phones)
  useEffect(() => {
    const nav = tabsRef.current;
    const on = nav?.querySelector<HTMLElement>("[aria-current='page']");
    if (!nav || !on || nav.scrollWidth <= nav.clientWidth) return;
    const left = on.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    if (left < nav.scrollLeft) nav.scrollLeft = left - 8;
    else if (left + on.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = left + on.offsetWidth - nav.clientWidth + 8;
  }, [tab, mode]);

  // autosave a moment after each change, and before leaving
  const saver = useMemo(
    () =>
      autosaver(() => {
        const r = saveProject(store.project);
        setSave(r.ok ? "saved" : "failed");
        setSaveError(r.ok ? null : r.reason);
      }),
    [store],
  );
  useEffect(() => {
    const off = store.onChange(() => {
      setSave("saving");
      saver.touch();
    });
    const flush = () => saver.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      off();
      window.removeEventListener("pagehide", flush);
      saver.flush();
    };
  }, [store, saver]);

  // a new level opens at its bottom left
  useEffect(() => {
    setSelected(null);
    setCell(null);
    setView((v) => clampView({ ...v, x: 0, y: Math.max(0, level.size.h - v.h / v.zoom) }, level));
    // only on a level change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId]);

  const reach = useMemo(
    () => (showReach ? reachability(level) : null),
    // the version says when the level changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, version, showReach],
  );

  // the game settings' and menus' live checks (validation.md, level 1)
  const issues = useMemo(
    () => gameIssues(p),
    // the version says when the project changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, version],
  );
  const openIssue = useCallback((target: NonNullable<ValidationIssue["target"]>) => {
    if (target.tab === "menus") {
      if (target.screen) setMenuScreen(target.screen as MenuScreenId);
      setMenuFocus(target.field ?? null);
    }
    setTab(target.tab);
  }, []);

  // the Export review's "Go": open the level at the place, select the object
  const pendingFocus = useRef<Extract<Target, { tab: "build" }> | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    const f = pendingFocus.current;
    if (!f || (f.level && f.level !== level.id)) return;
    pendingFocus.current = null;
    if (typeof f.x === "number" && typeof f.y === "number") setView((v) => clampView({ ...v, x: f.x! - v.w / v.zoom / 2, y: f.y! - v.h / v.zoom / 2 }, level));
    if (f.object) setSelected(f.object);
    // runs after the level change effect above, so the place wins
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick, levelId]);

  const objectLabel = useCallback(
    (o: LevelObject) => {
      const kind = (o.kind ?? o.item) as keyof typeof t.kinds | undefined;
      const extra = o.type === "crate" ? ` · hp ${String(o.hp ?? 2)}` : o.type === "enemy" && o.patrol ? ` · ${String(o.patrol)}` : "";
      return `${t.objects[o.type] ?? o.type}${kind && t.kinds[kind] ? ` · ${t.kinds[kind]}` : ""} · ${o.name}${extra}`;
    },
    [t],
  );

  const goTo = (x: number, y: number) => setView((v) => clampView({ ...v, x: x - v.w / v.zoom / 2, y: y - v.h / v.zoom / 2 }, level));
  const zoomBy = (f: number) => setView((v) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(v.zoom * f * 100) / 100));
    const cx = v.x + v.w / v.zoom / 2;
    const cy = v.y + v.h / v.zoom / 2;
    return clampView({ ...v, zoom, x: cx - v.w / zoom / 2, y: cy - v.h / zoom / 2 }, level);
  });

  const startPlay = async () => {
    saver.flush();
    try {
      const toView = await loadLevelView();
      setPlaying({ view: toView(level) });
    } catch {
      setStatus(t.ide.playSoon);
    }
  };

  // keyboard shortcuts (not while typing)
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e: KeyboardEvent) => {
    if (playing) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && k === "y") {
      e.preventDefault();
      store.redo();
      return;
    }
    if (mod || e.altKey || tab !== "build") return;
    const tools: Record<string, Tool> = { v: "select", b: "pencil", e: "eraser", g: "fill", h: "hand" };
    if (tools[k]) setTool(tools[k]);
    else if (k === "p") void startPlay();
    else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      deleteObject(store, level.id, selected, t.inspector.delete);
      setSelected(null);
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const layout = layoutOf(p);
  const levelIndex = p.levels.findIndex((l) => l.id === level.id);
  const tabs: Tab[] = ["build", "characters", "game", "menus", "export"];
  const pct = Math.round(view.zoom * 100);

  const pickPart = (id: string) => {
    setPartId(id);
    if (tool !== "pencil" && tool !== "fill") setTool("pencil");
    // on a phone the sheet gets out of the way to paint
    if (mode === "phone") setSheet(null);
  };
  const projectPanel = <ProjectTree store={store} project={p} levelId={level.id} onLevel={setLevelId} />;
  const partsPanel = <PartsPalette partId={partId} level={level} activeLayerId={activeLayerId} images={images} onPart={pickPart} />;
  const inspectorPanel = <Inspector store={store} level={level} selected={selected} cell={cell} onSelect={setSelected} />;
  const layersPanel = <LayersPanel store={store} level={level} activeLayerId={activeLayerId} onActive={setActiveLayerId} />;
  const checksPanel = (
    <>
      <WarningsPanel
        reach={reach}
        onGo={(x, y) => {
          goTo(x, y);
          if (mode === "phone") setSheet(null);
        }}
        extra={issues
          .filter((i) => i.severity !== "info")
          .map((i, k) => ({ key: `g${k}:${i.id}`, text: issueText(i, gt, mt), go: () => i.target && openIssue(i.target) }))}
      />
      <MetersPanel project={p} />
    </>
  );
  const sheetTabs: Sheet[] = mode === "phone" ? ["parts", "layers", "inspector", "project", "checks"] : ["inspector", "layers", "checks"];
  const sheetTitle = (id: Sheet): string =>
    id === "parts" ? t.parts.title : id === "layers" ? t.layers.title : id === "inspector" ? t.ide.inspector : id === "project" ? t.tree.project : t.warnings.title;

  return (
    <div ref={ideRef} className={`wm-ide is-${mode}${fit ? " is-fit" : ""}`}>
      <header className="wm-top">
        <IconButton label={t.ide.home} onClick={onHome}>
          <IconBack />
        </IconButton>
        <Logo />
        <span className="wm-chip wm-mono wm-level-chip">{t.ide.levelChip(levelIndex + 1, level.name)}</span>
        <span className="wm-chip is-voice wm-hide-sm">{t.ide.boardChip(layout.id, layout.players, layout.buttons)}</span>
        <span className="wm-chip wm-hide-sm" title={t.ide.genre}>
          {t.genres[p.genre]?.name ?? t.genres["platform-shooter"].name}
        </span>
        <span className={`wm-save wm-mono is-${save}`} role="status" title={save === "saved" ? t.ide.saved : save === "saving" ? t.ide.saving : t.ide.notSaved}>
          ● <span className="wm-save-text">{save === "saved" ? t.ide.saved : save === "saving" ? t.ide.saving : t.ide.notSaved}</span>
        </span>
        <span className="wm-grow" />
        <nav ref={tabsRef} className="wm-tabs" aria-label={t.name.first + " " + t.name.second}>
          {tabs.map((id) => (
            <button key={id} type="button" className={`wm-cap${tab === id ? " is-on" : ""}`} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
              {t.ide.tabs[id]}
            </button>
          ))}
        </nav>
        <IconButton label={t.ide.undo(store.undoLabel)} disabled={!store.canUndo} onClick={() => store.undo()}>
          <IconUndo />
        </IconButton>
        <IconButton label={t.ide.redo(store.redoLabel)} disabled={!store.canRedo} onClick={() => store.redo()}>
          <IconRedo />
        </IconButton>
        <Capsule tone="play" size="lg" title={t.ide.playTip} onClick={() => void startPlay()}>
          <IconPlay /> {t.ide.play}
        </Capsule>
      </header>
      {saveError && (
        <p className="wm-note is-error wm-save-alert" role="alert">
          {saveError === "full" ? t.ide.saveFull : t.ide.saveBlocked}
        </p>
      )}

      {tab === "build" && (
        <div className="wm-build">
          {mode !== "phone" && <aside className="wm-left">{projectPanel}{partsPanel}</aside>}
          <main className="wm-center">
            <div className="wm-toolbar" role="toolbar" aria-label={t.tools.paints}>
              <IconButton label={t.tools.select} on={tool === "select"} onClick={() => setTool("select")}>
                <IconSelect />
              </IconButton>
              <IconButton label={t.tools.pencil} on={tool === "pencil"} onClick={() => setTool("pencil")}>
                <IconPencil />
              </IconButton>
              <IconButton label={t.tools.eraser} on={tool === "eraser"} onClick={() => setTool("eraser")}>
                <IconEraser />
              </IconButton>
              <IconButton label={t.tools.fill} on={tool === "fill"} onClick={() => setTool("fill")}>
                <IconFill />
              </IconButton>
              <IconButton label={t.tools.hand} on={tool === "hand"} onClick={() => setTool("hand")}>
                <IconHand />
              </IconButton>
              <span className="wm-sep" aria-hidden="true" />
              <span className="wm-h wm-hide-sm">{t.tools.paints}</span>
              <span className="wm-row wm-chips">
                {TERRAIN_TAGS.map((tag) => {
                  const id = tag === "crate" ? "crate" : `tag:${tag}`;
                  return (
                    <TagChip
                      key={tag}
                      tag={tag}
                      on={partId === id}
                      onClick={() => {
                        setPartId(id);
                        if (tool !== "pencil" && tool !== "fill") setTool("pencil");
                      }}
                    />
                  );
                })}
              </span>
              <span className="wm-grow" />
              <Capsule size="sm" on={showGrid} onClick={() => setShowGrid((v) => !v)}>
                {t.tools.grid} 16
              </Capsule>
              <Capsule size="sm" on={autoArt} title={t.tools.autoArtTip} onClick={() => setAutoArt((v) => !v)}>
                {t.tools.autoArt}
              </Capsule>
              <Capsule size="sm" on={showReach} title={t.tools.reachTip} onClick={() => setShowReach((v) => !v)}>
                {t.tools.reach}
              </Capsule>
              <Capsule size="sm" on={showScreen} title={t.tools.screenTip} onClick={() => setShowScreen((v) => !v)}>
                {t.tools.screen}
              </Capsule>
              <IconButton className="is-sm" label={t.tools.zoomOut} onClick={() => zoomBy(1 / 1.25)}>
                <IconZoomOut />
              </IconButton>
              <span className="wm-mono wm-dim wm-zoom">{t.tools.zoom(pct)}</span>
              <IconButton className="is-sm" label={t.tools.zoomIn} onClick={() => zoomBy(1.25)}>
                <IconZoomIn />
              </IconButton>
            </div>
            <LevelCanvas
              store={store}
              level={level}
              version={version}
              images={images}
              tool={tool}
              part={part}
              activeLayerId={activeLayerId}
              selected={selected}
              onSelect={(name, c) => {
                setSelected(name);
                setCell(c ?? null);
              }}
              view={view}
              onView={setView}
              showGrid={showGrid}
              showScreen={showScreen}
              autoArt={autoArt}
              reach={reach}
              onStatus={setStatus}
              onTool={setTool}
              objectLabel={objectLabel}
            />
            {mode !== "phone" && <Minimap level={level} version={version} images={images} view={view} onView={goTo} />}
            <p className="wm-status wm-small wm-dim" role="status">
              {status || (mode === "phone" ? "" : t.shortcuts)}
            </p>
            {mode !== "desktop" && sheet && (
              <section className="wm-sheet" aria-label={sheetTitle(sheet)}>
                <IconButton className="is-sm wm-sheet-close" label={t.ide.close} onClick={() => setSheet(null)}>
                  <IconX />
                </IconButton>
                <div className="wm-sheet-body">
                  {sheet === "parts" && partsPanel}
                  {sheet === "project" && projectPanel}
                  {sheet === "inspector" && inspectorPanel}
                  {sheet === "layers" && layersPanel}
                  {sheet === "checks" && checksPanel}
                </div>
              </section>
            )}
            {mode !== "desktop" && (
              <nav className="wm-sheet-tabs" aria-label={t.ide.panels}>
                {sheetTabs.map((id) => (
                  <button key={id} type="button" className={`wm-cap is-sm${sheet === id ? " is-on" : ""}`} aria-expanded={sheet === id} onClick={() => setSheet((s) => (s === id ? null : id))}>
                    {sheetTitle(id)}
                  </button>
                ))}
              </nav>
            )}
          </main>
          {mode === "desktop" && (
            <aside className="wm-right">
              {inspectorPanel}
              {layersPanel}
              {checksPanel}
            </aside>
          )}
        </div>
      )}

      {tab === "characters" && (
        <Suspense fallback={<p className="wm-pad wm-dim">{t.home.loading}</p>}>
          <div className="wm-tabbody">
            <CharactersScreen key={charFocus.n} characterId={charFocus.id} project={p} onChange={(next: Project) => store.editProject(t.ide.tabs.characters, (cur) => Object.assign(cur, cloneProject(next)))} />
          </div>
        </Suspense>
      )}
      {tab === "game" && (
        <Suspense fallback={<p className="wm-pad wm-dim">{t.home.loading}</p>}>
          <GameScreen store={store} project={p} issues={issues} onGo={openIssue} />
        </Suspense>
      )}
      {tab === "menus" && (
        <Suspense fallback={<p className="wm-pad wm-dim">{t.home.loading}</p>}>
          <MenusScreen
            store={store}
            project={p}
            version={version}
            screen={menuScreen}
            onScreen={(id) => {
              setMenuScreen(id);
              setMenuFocus(null);
            }}
            focusField={menuFocus}
            issues={issues}
            onGo={openIssue}
          />
        </Suspense>
      )}
      {tab === "export" && (
        <ExportView
          project={p}
          version={version}
          store={store}
          onGo={(target) => {
            if (target.tab === "characters") setCharFocus((f) => ({ id: target.character ?? null, n: f.n + 1 }));
            if (target.tab !== "build") {
              openIssue(target);
              return;
            }
            pendingFocus.current = target;
            if (target.level) setLevelId(target.level);
            setShowReach(true);
            setTab("build");
            setFocusTick((n) => n + 1);
          }}
        />
      )}

      {playing && (
        <div className="wm-play-layer">
          <Suspense fallback={<p className="wm-pad wm-dim">{t.home.loading}</p>}>
            <PlayView
              level={playing.view}
              players={Math.min(2, p.settings.players)}
              maxPlayers={p.settings.players}
              lives={p.settings.dip.lives}
              rules={p.settings.rules}
              runTapMs={runTapMs(p)}
              combo={layout.buttons < 3}
              variants={playerSlots(p).map((s) => s.variant)}
              texts={{
                start: menuText(p, "hud", "join"),
                ammo: menuText(p, "hud", "ammo"),
                cleared: menuText(p, "hud", "cleared"),
                over: menuText(p, "gameOver", "heading"),
                overLine: menuText(p, "gameOver", "line"),
              }}
              onEdit={(edit: PlayModeEdit) => applyPlayEdit(store, level.id, edit, t.ide.play)}
              onBack={(at) => {
                setPlaying(null);
                setTab("build");
                if (at) goTo(at.x, at.y - 48);
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
