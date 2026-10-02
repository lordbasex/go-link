// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { promptEs } from "../i18n/prompt.es";
import { newProject } from "../model";
import { EditorStore } from "../editor/store";
import { PromptDialog } from "../ui/organisms/PromptDialog";
import { hasBuiltInAi, resetChromeAi } from "./chromeAi";
import { resetEnglish } from "./useEnglish";

const g = globalThis as Record<string, unknown>;
const NAMES = ["Translator", "LanguageDetector", "Proofreader", "LanguageModel", "SpeechRecognition", "webkitSpeechRecognition"];

afterEach(() => {
  cleanup();
  for (const n of NAMES) delete g[n];
  resetChromeAi();
  resetEnglish();
});

/** A Chrome with its built-in AI: Spanish detected, a tiny "translator", a proofreader and on-device speech. */
function fakeChrome(opts: { translator?: "available" | "downloadable"; model?: boolean } = {}) {
  const dict: Record<string, string> = { "una bicicleta roja": "a red bicycle", "una bisicleta roja": "a red bicycle" };
  const created = { translator: 0 };
  g.LanguageDetector = {
    availability: async () => "available",
    create: async () => ({ detect: async (text: string) => [{ detectedLanguage: /bi[sc]icleta|hola/.test(text) ? "es" : "en", confidence: 0.9 }] }),
  };
  let translator = opts.translator ?? "available";
  let refused = 0;
  g.Translator = {
    availability: async () => translator,
    create: async () => {
      // the first download asked outside a click is refused, as Chrome does without a user gesture
      if (translator === "downloadable" && refused++ === 0) throw new DOMException("needs a gesture", "NotAllowedError");
      created.translator++;
      translator = "available";
      return { translate: async (text: string) => dict[text] ?? text };
    },
  };
  g.Proofreader = {
    availability: async () => "available",
    create: async () => ({ proofread: async (text: string) => ({ correctedInput: text.replace("bisicleta", "bicicleta") }) }),
  };
  if (opts.model)
    g.LanguageModel = {
      availability: async () => "available",
      create: async () => ({ prompt: async (text: string) => (text === "una bicicleta roja" ? "a red bicycle (model)" : text) }),
    };
  class Rec {
    lang = "";
    continuous = false;
    interimResults = false;
    processLocally = false;
    onresult: ((e: unknown) => void) | null = null;
    onerror = null;
    onend: (() => void) | null = null;
    static available = vi.fn(async () => "available");
    static install = vi.fn(async () => true);
    static last: Rec | null = null;
    start() {
      Rec.last = this;
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  g.SpeechRecognition = Rec;
  return { created, Rec };
}

function open(kind: "object" | "background" = "object") {
  const p = newProject({ title: "Docks" });
  const store = new EditorStore(p);
  render(
    <LangProvider value="es">
      <PromptDialog store={store} project={p} kind={kind} onClose={() => {}} />
    </LangProvider>,
  );
  return store;
}
/** A button by its text (role queries are slow on a dialog this big). */
function find(text: string | RegExp): HTMLButtonElement | undefined {
  const re = typeof text === "string" ? new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) : text;
  return [...document.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));
}
async function button(text: string | RegExp): Promise<HTMLButtonElement> {
  // let the availability checks (promises) settle and React render them
  for (let i = 0; i < 50; i++) {
    const b = find(text);
    if (b) return b;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`no button ${text}`);
}

describe("Chrome's built-in AI in the prompt dialog", () => {
  it("is not offered outside Chrome: no buttons, a note, and the text goes as typed", async () => {
    expect(hasBuiltInAi()).toBe(false);
    open();
    expect(screen.getByText(promptEs.ai.none)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "una bicicleta roja" } });
    await waitFor(() => expect(screen.getByText(promptEs.ai.untranslated)).toBeTruthy());
    expect(find(/Dictar|Corregir/)).toBeUndefined();
    expect(document.querySelector(".wm-prompt-out pre")!.textContent).toContain("una bicicleta roja");
  });

  it("writes the prompt in English from a Spanish description, translated on this computer", async () => {
    fakeChrome();
    open();
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "una bicicleta roja" } });
    await waitFor(() => expect(document.querySelector(".wm-prompt-out pre")!.textContent).toContain("a red bicycle"));
    expect(document.querySelector(".wm-prompt-out pre")!.textContent).not.toContain("bicicleta");
    expect(screen.getByText(/Escrito en español/)).toBeTruthy();
    // what the user typed stays as typed
    expect((screen.getByLabelText("Descripción") as HTMLTextAreaElement).value).toBe("una bicicleta roja");
  });

  it("downloads the translator only from a click", async () => {
    const { created } = fakeChrome({ translator: "downloadable" });
    open();
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "una bicicleta roja" } });
    const get = await button(promptEs.ai.prepare);
    expect(created.translator).toBe(0);
    await act(async () => fireEvent.click(get));
    await waitFor(() => expect(document.querySelector(".wm-prompt-out pre")!.textContent).toContain("a red bicycle"));
    expect(created.translator).toBe(1);
  });

  it("translates with Chrome's language model while the translator is not downloaded", async () => {
    const { created } = fakeChrome({ translator: "downloadable", model: true });
    open();
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "una bicicleta roja" } });
    await waitFor(() => expect(document.querySelector(".wm-prompt-out pre")!.textContent).toContain("a red bicycle (model)"));
    expect(created.translator).toBe(0);
    expect(screen.queryByText(promptEs.ai.notYet)).toBeNull();
  });

  it("suggests the spelling fix and applies it only when chosen", async () => {
    fakeChrome();
    open();
    const desc = screen.getByLabelText("Descripción") as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: "una bisicleta roja" } });
    const fix = await button(/Corregir ortografía/);
    await act(async () => fireEvent.click(fix));
    const sug = (await screen.findByText(promptEs.ai.suggestion)).closest(".wm-aitext-sug")!;
    expect(sug.textContent).toContain("una bicicleta roja");
    expect(desc.value).toBe("una bisicleta roja");
    fireEvent.click(await button(promptEs.ai.use));
    expect(desc.value).toBe("una bicicleta roja");
  });

  it("dictates with on-device recognition only, in the interface's language", async () => {
    const { Rec } = fakeChrome();
    open();
    const mic = await button(/Dictar/);
    await act(async () => fireEvent.click(mic));
    expect(Rec.available).toHaveBeenCalledWith({ langs: ["es-ES"], processLocally: true });
    const r = Rec.last!;
    expect(r.processLocally).toBe(true);
    expect(r.lang).toBe("es-ES");
    act(() => r.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "un auto rojo" }, length: 1 }] }));
    expect((screen.getByLabelText("Descripción") as HTMLTextAreaElement).value).toBe("un auto rojo");
    fireEvent.click(await button(/Detener/));
    expect(await button(/Dictar/)).toBeTruthy();
  });
});
