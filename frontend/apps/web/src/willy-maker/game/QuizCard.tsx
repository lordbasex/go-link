// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Game tab's Questions card (genres.md, quiz and party): the quiz's
// questions in the order they are asked, each with three answers (B1 B2 B3)
// and the right one, and the text as the board's font will print it.

import { QUIZ_MAX } from "../engine/rules";
import { QUIZ_KINDS, kindOf, quizText } from "../engine/quiz";
import type { QuizQuestion } from "../model/types";
import type { EditorStore } from "../editor/store";
import { Capsule, Segmented } from "../ui/atoms";
import { useGameText } from "./texts";

export function QuizCard({ store, questions }: { store: EditorStore; questions: readonly QuizQuestion[] }) {
  const t = useGameText();
  const edit = (fn: (list: QuizQuestion[]) => void) =>
    store.editProject(t.quiz.undo, (p) => {
      const list = (p.quiz ?? []).map((q) => ({ ...q, a: [...q.a] as QuizQuestion["a"] }));
      fn(list);
      p.quiz = list;
    });
  return (
    <section className="wm-game-card wm-card" aria-labelledby="wm-quiz-title">
      <h2 id="wm-quiz-title" className="wm-h is-accent">
        {t.quiz.title}
      </h2>
      <p className="wm-dim wm-small">{t.quiz.help}</p>
      {!questions.length && <p className="wm-dim">{t.quiz.empty}</p>}
      <ol className="wm-quiz-list">
        {questions.map((q, i) => (
          <li key={i} className="wm-game-stack">
            <Segmented
              label={t.quiz.kind}
              value={kindOf(q)}
              options={QUIZ_KINDS.map((k) => ({ value: k, label: t.quiz.kinds[k] }))}
              onChange={(kind) =>
                edit((l) => {
                  const it = l[i]!;
                  // a minigame starts with its instructions, unless the text is the user's own
                  const ours = !it.q.trim() || Object.values(t.quiz.defaults).includes(it.q);
                  it.kind = kind;
                  if (kind !== "question" && ours) it.q = t.quiz.defaults[kind];
                })
              }
            />
            <label className="wm-game-stack">
              <span className="wm-field-label">{kindOf(q) === "question" ? t.quiz.question(i + 1) : t.quiz.instructions}</span>
              <textarea className="wm-input" rows={2} maxLength={160} value={q.q} onChange={(e) => edit((l) => (l[i]!.q = e.target.value))} />
            </label>
            {kindOf(q) === "question" && [0, 1, 2].map((k) => (
              <label key={k} className="wm-game-stack">
                <span className="wm-field-label">{t.quiz.answer("ABC"[k]!)}</span>
                <input className="wm-input is-sm" maxLength={36} value={q.a[k] ?? ""} onChange={(e) => edit((l) => (l[i]!.a[k] = e.target.value))} />
              </label>
            ))}
            {kindOf(q) === "question" && <Segmented label={t.quiz.right} value={q.right} options={[0, 1, 2].map((k) => ({ value: k, label: "ABC"[k]! }))} onChange={(right) => edit((l) => (l[i]!.right = right))} />}
            <p className="wm-dim wm-small wm-mono" aria-label={t.quiz.preview}>
              {quizText(q.q)}
            </p>
            <Capsule size="sm" onClick={() => edit((l) => l.splice(i, 1))}>
              {t.quiz.remove}
            </Capsule>
          </li>
        ))}
      </ol>
      <Capsule tone="primary" disabled={questions.length >= QUIZ_MAX} onClick={() => edit((l) => l.push({ q: "", a: ["", "", ""], right: 0 }))}>
        {t.quiz.add}
      </Capsule>
    </section>
  );
}
