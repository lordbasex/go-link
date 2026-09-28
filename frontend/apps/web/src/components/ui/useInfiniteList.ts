// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Infinite scroll for long lists (a full MAME set has thousands of games):
 * only the first `page` items are rendered, and a sentinel element at the
 * end of the list loads the next page when it scrolls into view. Filters
 * and search run on the whole list before it gets here; any change of
 * `resetKey` starts again from the first page.
 */
export function useInfiniteList<T>(items: T[], resetKey: string, page = 60) {
  const [count, setCount] = useState(page);
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => setCount(page), [resetKey, page]);

  const more = count < items.length;
  const sentinel = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node || !more || typeof IntersectionObserver === "undefined") return;
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) setCount((c) => c + page);
        },
        { rootMargin: "600px 0px" },
      );
      observer.current.observe(node);
    },
    [more, page],
  );

  useEffect(() => () => observer.current?.disconnect(), []);

  return { shown: items.slice(0, count), more, sentinel, loadMore: () => setCount((c) => c + page) };
}
