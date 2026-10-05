// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A text area with Chrome's built-in AI on this computer (ai/chromeAi.ts):
// dictation, spelling and a richer description. A button only shows when
// this browser can do it; a suggestion is never applied without a click.

import { useEffect, useRef, useState } from "react";
import { chromeAi, enrich, installSpeech, proofread, speechRecognizer, type Availability, type SpeechRec } from "../../ai/chromeAi";
import type { PromptMessages } from "../../i18n/prompt.en";
import { Capsule } from "../atoms";
import { IconCheck, IconMic, IconSparkle, IconStop } from "../icons";

type Can = { speech: Availability; spell: Availability; enrich: Availability };
const NONE: Can = { speech: "unavailable", spell: "unavailable", enrich: "unavailable" };
const usable = (a: Availability) => a !== "unavailable";

/** What this browser can do for a language (all "unavailable" outside Chrome). */
export function useChromeAi(lang: string): Can {
  const [can, setCan] = useState<Can>(NONE);
  useEffect(() => {
    let live = true;
    void Promise.all([chromeAi.speech(lang), chromeAi.proofreader(lang), chromeAi.model(lang)]).then(([speech, proof, model]) => {
      if (live) setCan({ speech, spell: usable(proof) ? proof : model, enrich: model });
    });
    return () => {
      live = false;
    };
  }, [lang]);
  return can;
}

export function AiTextArea({
  id,
  value,
  onChange,
  lang,
  what,
  placeholder,
  t,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  lang: string;
  /** What is described, in English, for the richer description ("a vehicle object"). */
  what: string;
  placeholder: string;
  t: PromptMessages["ai"];
}) {
  const can = useChromeAi(lang);
  const [busy, setBusy] = useState<"spell" | "enrich" | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<SpeechRec | null>(null);
  const base = useRef("");
  const valueNow = useRef(value);
  valueNow.current = value;

  useEffect(() => () => rec.current?.abort(), []);

  const ask = async (kind: "spell" | "enrich") => {
    if (!value.trim()) return;
    setBusy(kind);
    setNote(null);
    setSuggestion(null);
    try {
      const out = kind === "spell" ? await proofread(value, lang, setProgress) : await enrich(value, what, lang, setProgress);
      if (!out || out.trim() === value.trim()) setNote(kind === "spell" ? t.nothing : t.failed);
      else setSuggestion(out);
    } catch {
      setNote(t.failed);
    }
    setProgress(null);
    setBusy(null);
  };

  const dictate = async () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    setNote(null);
    if (can.speech !== "available" && !(await installSpeech(lang))) {
      setNote(t.failed);
      return;
    }
    const r = speechRecognizer(lang);
    if (!r) return;
    rec.current = r;
    base.current = valueNow.current;
    r.onresult = (e) => {
      let final = "";
      let live = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) final += res[0].transcript;
        else live += res[0].transcript;
      }
      setInterim(live);
      if (final) onChange(`${base.current}${base.current && !/\s$/.test(base.current) ? " " : ""}${final.trim()}`);
    };
    r.onerror = (e) => setNote(e.error === "not-allowed" || e.error === "service-not-allowed" ? t.micDenied : t.failed);
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    try {
      r.start();
      setListening(true);
    } catch {
      setNote(t.failed);
    }
  };

  const any = usable(can.speech) || usable(can.spell) || usable(can.enrich);
  return (
    <div className="wm-aitext">
      <textarea id={id} className="wm-input wm-prompt-desc" rows={4} placeholder={placeholder} value={value} spellCheck onChange={(e) => onChange(e.target.value)} />
      {any && (
        <div className="wm-row is-wrap wm-aitext-bar">
          {usable(can.speech) && (
            <Capsule size="sm" on={listening} title={t.dictateHelp} aria-pressed={listening} onClick={() => void dictate()}>
              {listening ? <IconStop /> : <IconMic />} {listening ? t.stop : t.dictate}
            </Capsule>
          )}
          {usable(can.spell) && (
            <Capsule size="sm" title={t.spellHelp} disabled={busy !== null || !value.trim()} onClick={() => void ask("spell")}>
              <IconCheck /> {t.spell}
            </Capsule>
          )}
          {usable(can.enrich) && (
            <Capsule size="sm" title={t.enrichHelp} disabled={busy !== null || !value.trim()} onClick={() => void ask("enrich")}>
              <IconSparkle /> {t.enrich}
            </Capsule>
          )}
          {listening && (
            <span className="wm-dim wm-small" role="status">
              {t.listening} {interim}
            </span>
          )}
          {busy && (
            <span className="wm-dim wm-small" role="status">
              {progress !== null && progress < 1 ? t.downloading(Math.round(progress * 100)) : t.working}
            </span>
          )}
        </div>
      )}
      {note && <p className="wm-dim wm-small" role="status">{note}</p>}
      {suggestion && (
        <div className="wm-note wm-small wm-aitext-sug" role="region" aria-label={t.suggestion}>
          <strong>{t.suggestion}</strong>
          <p>{suggestion}</p>
          <div className="wm-row">
            <Capsule
              size="sm"
              tone="primary"
              onClick={() => {
                onChange(suggestion);
                setSuggestion(null);
              }}
            >
              {t.use}
            </Capsule>
            <Capsule size="sm" onClick={() => setSuggestion(null)}>
              {t.discard}
            </Capsule>
          </div>
        </div>
      )}
    </div>
  );
}
