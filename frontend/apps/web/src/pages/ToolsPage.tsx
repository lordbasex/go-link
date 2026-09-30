// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Link } from "react-router-dom";
import { t } from "../i18n";
import { ToolsIcon } from "../components/Icons";
import { HeroTile, PageHero } from "../components/ui/PageHero";
import { ControllerModel } from "../tools/ControllerModel";
import { EMPTY_PAD } from "@go-link/shared";
import { SkinThumb } from "../tools/SkinThumb";

/**
 * /tools: the site's tools as cards (more will join them). They run in the
 * browser alone: no device, no account, nothing stored.
 */
export function ToolsPage() {
  const tools = [
    {
      to: "/test-controller",
      title: t.tools.testTitle,
      text: t.tools.testText,
      cta: t.tools.testCta,
      tag: t.tools.testTag,
      art: <ControllerModel model="dualsense" pad={EMPTY_PAD} label={t.tools.testTitle} />,
      cls: "is-test",
    },
    {
      to: "/tools/skin-editor",
      title: t.tools.editorTitle,
      text: t.tools.editorText,
      cta: t.tools.editorCta,
      tag: t.tools.editorTag,
      art: <SkinThumb />,
      cls: "is-editor",
    },
    {
      to: "/tools/games",
      title: t.tools.gamesTitle,
      text: t.tools.gamesText,
      cta: t.tools.gamesCta,
      tag: t.tools.gamesTag,
      art: <GamesArt />,
      cls: "is-games",
    },
  ];
  return (
    <div className="page page-frame tools-page">
      <PageHero
        tile={
          <HeroTile>
            <ToolsIcon size={30} />
          </HeroTile>
        }
        eyebrow={t.tools.eyebrow}
        title={t.tools.title}
        subtitle={t.tools.intro}
      />
      <div className="page-body">
        <ul className="tools-grid">
          {tools.map((tool) => (
            <li key={tool.to}>
              <Link to={tool.to} className="card tool-card">
                <span className={`tool-card-art ${tool.cls}`} aria-hidden="true">
                  {tool.art}
                  <span className="tool-card-tag">{tool.tag}</span>
                </span>
                <span className="tool-card-body">
                  <strong className="tool-card-title">{tool.title}</strong>
                  <span className="tool-card-text">{tool.text}</span>
                  <span className="button button-primary tool-card-cta">{tool.cta} →</span>
                </span>
              </Link>
            </li>
          ))}
          <li className="tool-card-soon" aria-hidden="true">
            {t.tools.more}
          </li>
        </ul>
      </div>
    </div>
  );
}

/** The mini-games card's picture: a snake, a paddle and a ball in pixels. */
function GamesArt() {
  const snake = [
    [4, 9],
    [5, 9],
    [6, 9],
    [7, 9],
    [7, 8],
    [7, 7],
    [8, 7],
    [9, 7],
  ];
  return (
    <svg className="games-art" viewBox="0 0 160 100" aria-hidden="true">
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4, 5, 6].map((c) => (r === 3 && (c === 2 || c === 5) ? null : <rect key={`${r}${c}`} className={`ga-brick is-${r}`} x={14 + c * 19} y={10 + r * 8} width={16} height={5} />)),
      )}
      {snake.map(([x, y], i) => (
        <rect key={i} className={i === snake.length - 1 ? "ga-head" : "ga-body"} x={x! * 8} y={y! * 8} width={7} height={7} />
      ))}
      <rect className="ga-food" x={104} y={56} width={6} height={6} />
      <rect className="ga-ball" x={118} y={70} width={5} height={5} />
      <rect className="ga-paddle" x={100} y={88} width={36} height={5} />
    </svg>
  );
}
