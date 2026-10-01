// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The live review for the UI: the project's checks, recomputed when the
// editor's version changes, with the rules other parts of the module add.
// The picture checks (pictures.ts) follow a moment later, in small steps:
// until they finish the review says `checking` and is not ready.

import { useEffect, useMemo, useState } from "react";
import { cloneProject, type Project } from "../../model";
import { boardOf } from "../../board/cps1";
import { mergeReview, reviewProject, type Check, type Review } from ".";
import { EXTRA_RULES } from "./extra";
import { reviewPictures } from "./pictures";

/** Waits this long after the last change before reading the pictures again. */
const PICTURES_DELAY_MS = 250;

export function useReview(project: Project, version: number): Review {
  const base = useMemo(
    () => reviewProject(project, { extra: EXTRA_RULES }),
    // the version says when the project changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, version],
  );
  const [pictures, setPictures] = useState<{ version: number; checks: Check[] } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    // the editor changes the project in place: the checks read a copy
    const copy = cloneProject(project);
    const timer = setTimeout(() => {
      void reviewPictures(copy, boardOf(copy), { signal: abort.signal })
        .then((checks) => {
          if (checks && !abort.signal.aborted) setPictures({ version, checks });
        })
        .catch(() => {
          // a picture check that fails never blocks the others
          if (!abort.signal.aborted) setPictures({ version, checks: [] });
        });
    }, PICTURES_DELAY_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [project, version]);
  // while a new run is pending, the last run's findings stay on the list
  return useMemo(() => mergeReview(base, pictures?.checks ?? [], pictures?.version !== version), [base, pictures, version]);
}
