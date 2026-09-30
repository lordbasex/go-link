// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Splits every text of a page into one element per word, so each word is its
// own solid piece: a paragraph as a single block would let the hero walk on
// air and vanish in one shot. Spaces stay plain text, so the lines wrap as
// before.

/** The class of a word piece (destroy.css makes it an inline block). */
export const WORD_CLASS = "dz-w";

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "TITLE", "OPTION", "SELECT"]);

/** Wraps each word of `root`'s texts in a span. Returns how many words. */
export function atomize(root: Element): number {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName) || parent.closest("svg") || parent.classList.contains(WORD_CLASS)) return 2; // FILTER_REJECT
      return node.nodeValue && /\S/.test(node.nodeValue) ? 1 : 2; // FILTER_ACCEPT
    },
  });
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  let words = 0;
  const view = doc.defaultView;
  for (const text of texts) {
    // In a flex or grid container every child is laid out on its own and the
    // spaces between them vanish ("Only for guests" → "Onlyforguests"): the
    // words then go in one plain inline wrapper, which keeps its spaces.
    const display = text.parentElement && view ? view.getComputedStyle(text.parentElement).display : "";
    const inFlex = /flex|grid/.test(display);
    const frag: DocumentFragment | HTMLSpanElement = inFlex ? doc.createElement("span") : doc.createDocumentFragment();
    for (const part of (text.nodeValue ?? "").split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(doc.createTextNode(part));
        continue;
      }
      const span = doc.createElement("span");
      span.className = WORD_CLASS;
      span.textContent = part;
      frag.appendChild(span);
      words++;
    }
    text.replaceWith(frag);
  }
  return words;
}
