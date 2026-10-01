// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// go-link's own 8x8 font for the board's text layer: 5x7 glyphs, one
// string per row ('#' = ink), drawn in an 8x8 cell one pixel in from the
// top left with a shadow one pixel down-right. Uppercase only; text is
// folded to uppercase before it is drawn. Shared by the ROM tools
// (rom/tools/font.mjs re-exports it) and Willy Maker's menu screens.

export const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "A": [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  "B": ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  "C": [" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "],
  "D": ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  "E": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  "F": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  "G": [" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####"],
  "H": ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  "I": [" ### ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  "J": ["  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
  "K": ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  "L": ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  "M": ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  "N": ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
  "O": [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  "P": ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  "Q": [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  "R": ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  "S": [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  "T": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  "U": ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  "V": ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  "W": ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
  "X": ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  "Y": ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  "Z": ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],
  "!": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "],
  "?": [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
  ".": ["     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "],
  ",": ["     ", "     ", "     ", "     ", " ##  ", "  #  ", " #   "],
  ":": ["     ", " ##  ", " ##  ", "     ", " ##  ", " ##  ", "     "],
  "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
  "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
  "'": ["  #  ", "  #  ", " #   ", "     ", "     ", "     ", "     "],
  "(": ["   # ", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   # "],
  ")": [" #   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", " #   "],
  "=": ["     ", "     ", "#####", "     ", "#####", "     ", "     "],
  "%": ["##   ", "##  #", "   # ", "  #  ", " #   ", "#  ##", "   ##"],
  "#": [" # # ", " # # ", "#####", " # # ", "#####", " # # ", " # # "],
};

/** The text layer's character size and the screen in characters (384 x 224). */
export const FONT_CELL = 8;
export const TEXT_COLS = 48;
export const TEXT_ROWS = 28;

/** Whether the font draws a character (after folding to uppercase); space is always fine. */
export function fontHas(ch: string): boolean {
  return ch === " " || GLYPHS[ch.toUpperCase()] !== undefined;
}

/** The characters of `text` the font cannot draw, once each, in order. */
export function unsupportedChars(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) if (!fontHas(ch) && !out.includes(ch)) out.push(ch);
  return out;
}

/** An 8x8 glyph as pens: ink, a dark shadow one pixel down-right, else transparent (15). */
export function glyphPixels(ch: string, ink = 1, shadow = 2): number[][] {
  const rows = GLYPHS[ch];
  const px = Array.from({ length: 8 }, () => new Array<number>(8).fill(15));
  if (!rows) return px;
  rows.forEach((row, y) => {
    for (let x = 0; x < 5; x++) {
      if (row[x] !== "#") continue;
      const below = px[y + 2];
      if (below && below[x + 2] === 15) below[x + 2] = shadow;
      px[y + 1]![x + 1] = ink;
    }
  });
  return px;
}
