// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { detectFigures, feetPivot, gridBoxes, keyBackground, mergeBoxes, readingOrder, splitAtEmptyColumns, type Rgba } from "./detect";
import { analyzeZones, MAX_COLORS, packAtlas, scaleFor, scaleFrames, applyMask, zoneCount, type SourceFrame } from "./convert";
import { draftOf, emptyDraft, removeCharacter, saveCharacter, slug, uniqueCharacterId } from "./character";
import { newProject } from "../model";
import { SPRITES } from "./text";
import type { ScaledFrame } from "@go-link/cps1";

type C = [number, number, number];

/** A sheet of w x h filled with bg, figures drawn by the callback. */
function sheet(w: number, h: number, bg: C, draw: (set: (x: number, y: number, c: C) => void) => void): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let k = 0; k < w * h; k++) data.set([...bg, 255], k * 4);
  draw((x, y, c) => data.set([...c, 255], (y * w + x) * 4));
  return { w, h, data };
}

const rect = (set: (x: number, y: number, c: C) => void, x0: number, y0: number, w: number, h: number, c: C) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
};

/** A figure: a black outline with a black shirt inside (the case that must survive keying). */
function figure(set: (x: number, y: number, c: C) => void, x0: number, y0: number, w = 12, h = 30) {
  rect(set, x0, y0, w, h, [0, 0, 0]);
  rect(set, x0 + 1, y0 + 1, w - 2, 8, [238, 170, 119]); // head
  rect(set, x0 + 1, y0 + 9, w - 2, 10, [20, 20, 30]); // dark shirt, enclosed
  rect(set, x0 + 1, y0 + 19, w - 2, h - 20, [34, 68, 136]); // jeans
}

const count = (mask: Uint8Array) => mask.reduce((s, v) => s + v, 0);

describe("keyBackground", () => {
  it("turns the pink fringe an image AI leaves around a figure on magenta into the figure's own color", () => {
    // a 6 x 6 black square with a 1 px half-magenta ring, on a 12 x 12 off-magenta picture (as image AIs draw it)
    const w = 12;
    const data = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const inner = x >= 4 && x < 8 && y >= 4 && y < 8;
        const ring = !inner && x >= 3 && x < 9 && y >= 3 && y < 9;
        data.set(inner ? [10, 10, 20, 255] : ring ? [128, 12, 130, 255] : [239, 12, 240, 255], o);
      }
    const img: Rgba = { w, h: w, data };
    const { mask, magenta } = keyBackground(img, { tolerance: 18 });
    expect(magenta).toBe(true);
    // the ring stays part of the figure, recolored from its dark inside
    expect(mask[3 * w + 3]).toBe(1);
    expect([...data.slice((5 * w + 3) * 4, (5 * w + 3) * 4 + 3)]).toEqual([10, 10, 20]);
    expect(mask[0]).toBe(0);
  });

  it("takes the uneven magenta an image AI paints, as far as it touches the background, and keeps a pink inside the figure", () => {
    const w = 9;
    const data = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const figure = x >= 2 && x < 7 && y >= 2 && y < 7;
        const pinkInside = x === 4 && y === 4;
        // the bottom rows are a darker magenta, well past the tolerance
        data.set(pinkInside ? [210, 60, 190, 255] : figure ? [20, 20, 30, 255] : y >= 7 ? [180, 30, 175, 255] : [239, 12, 240, 255], (y * w + x) * 4);
      }
    const { mask } = keyBackground({ w, h: w, data }, { tolerance: 18 });
    expect(mask[8 * w + 4]).toBe(0);
    expect(mask[4 * w + 4]).toBe(1);
    expect(mask.reduce((a, b) => a + b, 0)).toBe(25);
  });

  it("recolors a skin pixel mixed with magenta, and leaves a purple of the figure's own alone", () => {
    // three rows: magenta, then magenta, a skin and magenta mix, skin, skin, a purple of the figure, skin, magenta
    const w = 7;
    const data = new Uint8ClampedArray(w * 3 * 4);
    const mid = [[239, 12, 240], [236, 90, 168], [230, 150, 100], [230, 150, 100], [120, 40, 170], [230, 150, 100], [239, 12, 240]];
    for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) data.set([...(y === 1 ? mid[x]! : [239, 12, 240]), 255], (y * w + x) * 4);
    const img: Rgba = { w, h: 3, data };
    const { mask } = keyBackground(img, { tolerance: 18 });
    const at = (x: number) => [...data.slice((w + x) * 4, (w + x) * 4 + 3)];
    expect(at(1)).toEqual([230, 150, 100]);
    expect(at(4)).toEqual([120, 40, 170]);
    expect(mask[w + 4]).toBe(1);
  });

  it("keys only the background connected to the border, so a dark shirt stays", () => {
    const img = sheet(40, 40, [22, 22, 28], (set) => figure(set, 10, 5));
    const { mask, background, magenta } = keyBackground(img, { tolerance: 18 });
    expect(background).toEqual([22, 22, 28]);
    expect(magenta).toBe(false);
    expect(count(mask)).toBe(12 * 30);
    // a shirt pixel close to the background color is kept: it is inside the outline
    expect(mask[15 * 40 + 14]).toBe(1);
  });

  it("keys magenta everywhere, even enclosed", () => {
    const img = sheet(30, 30, [255, 0, 255], (set) => {
      rect(set, 5, 5, 10, 10, [0, 0, 0]);
      rect(set, 8, 8, 3, 3, [255, 0, 255]);
    });
    const { mask, magenta } = keyBackground(img, { tolerance: 18 });
    expect(magenta).toBe(true);
    expect(count(mask)).toBe(100 - 9);
  });

  it("uses transparency when the border is transparent", () => {
    const data = new Uint8ClampedArray(10 * 10 * 4);
    data.set([200, 10, 10, 255], (5 * 10 + 5) * 4);
    const { mask, background } = keyBackground({ w: 10, h: 10, data }, { tolerance: 18 });
    expect(background).toBeNull();
    expect(count(mask)).toBe(1);
  });
});

describe("detectFigures", () => {
  it("finds the figures in reading order and drops lines and label text", () => {
    const img = sheet(120, 90, [22, 22, 28], (set) => {
      rect(set, 2, 2, 100, 1, [80, 90, 110]); // a separator line
      rect(set, 2, 6, 2, 3, [200, 200, 220]); // label specks
      rect(set, 6, 6, 2, 3, [200, 200, 220]);
      figure(set, 60, 10);
      figure(set, 20, 12);
      figure(set, 40, 50);
    });
    const { mask } = keyBackground(img, { tolerance: 18 });
    const boxes = detectFigures(mask, img.w, img.h);
    expect(boxes).toEqual([
      { x: 20, y: 12, w: 12, h: 30 },
      { x: 60, y: 10, w: 12, h: 30 },
      { x: 40, y: 50, w: 12, h: 30 },
    ]);
  });

  it("cuts a box twice as wide as its row's others: two poses drawn touching (T-30)", () => {
    const W = 200;
    const H = 40;
    const mask = new Uint8Array(W * H);
    const body = (x0: number) => {
      for (let y = 5; y < 35; y++) for (let x = x0; x < x0 + 14; x++) mask[y * W + x] = 1;
    };
    body(4);
    body(30);
    body(56);
    // two poses touching: the second one's arm reaches over into the first for half the height
    body(90);
    body(106);
    for (let y = 5; y < 20; y++) for (let x = 100; x < 110; x++) mask[y * W + x] = 1;
    body(140);
    const boxes = detectFigures(mask, W, H);
    expect(boxes.map((b) => b.w <= 16)).toEqual(boxes.map(() => true));
    expect(boxes).toHaveLength(6);
  });

  it("joins a muzzle flash that nearly touches its figure", () => {
    const img = sheet(80, 50, [0, 0, 0], () => undefined);
    const data = img.data;
    const set = (x: number, y: number, c: C) => data.set([...c, 255], (y * 80 + x) * 4);
    rect(set, 10, 10, 12, 30, [200, 150, 100]);
    rect(set, 23, 20, 8, 4, [255, 220, 60]);
    const { mask } = keyBackground(img, { tolerance: 10 });
    expect(detectFigures(mask, 80, 50)).toEqual([{ x: 10, y: 10, w: 21, h: 30 }]);
  });

  it("splits merged poses at empty columns and orders rows", () => {
    const mask = new Uint8Array(40 * 10);
    for (let y = 0; y < 10; y++) for (const x of [2, 3, 4, 5, 9, 10, 11, 12]) mask[y * 40 + x] = 1;
    expect(splitAtEmptyColumns(mask, 40, { x: 0, y: 0, w: 20, h: 10 }, 3)).toEqual([
      { x: 2, y: 0, w: 4, h: 10 },
      { x: 9, y: 0, w: 4, h: 10 },
    ]);
    expect(mergeBoxes([{ x: 0, y: 0, w: 5, h: 5 }, { x: 6, y: 0, w: 5, h: 5 }], 2)).toEqual([{ x: 0, y: 0, w: 11, h: 5 }]);
    expect(readingOrder([{ x: 50, y: 0, w: 5, h: 20 }, { x: 0, y: 30, w: 5, h: 20 }, { x: 10, y: 2, w: 5, h: 20 }]).map((b) => b.x)).toEqual([10, 50, 0]);
  });

  it("cuts a fixed grid, skipping empty cells", () => {
    const mask = new Uint8Array(96 * 48);
    mask[10 * 96 + 60] = 1;
    expect(gridBoxes(mask, 96, 48, 48, 48)).toEqual([{ x: 48, y: 0, w: 48, h: 48 }]);
    expect(gridBoxes(mask, 96, 48, 48, 48, { trimCells: true })).toEqual([{ x: 60, y: 10, w: 1, h: 1 }]);
  });

  it("puts the pivot on the middle of the feet, on the last row", () => {
    const mask = new Uint8Array(20 * 20);
    for (const x of [4, 5, 12, 13]) mask[19 * 20 + x] = 1; // two shoes
    expect(feetPivot(mask, 20, { x: 0, y: 0, w: 20, h: 20 })).toEqual({ px: 9, py: 19 });
  });
});

function scaledSheet() {
  const img = sheet(60, 60, [255, 0, 255], (set) => {
    figure(set, 4, 5, 12, 48);
    figure(set, 24, 5, 12, 48);
  });
  const { mask } = keyBackground(img, { tolerance: 18 });
  const frames: SourceFrame[] = detectFigures(mask, img.w, img.h).map((b, i) => ({ id: `f${i + 1}`, ...b, ...feetPivot(mask, img.w, b) }));
  return { img, mask, frames };
}

describe("convert", () => {
  it("scales the idle height to the board height", () => {
    const { img, mask, frames } = scaledSheet();
    const anims = { idle: { frames: ["f1"], fps: 6, loop: true } };
    expect(scaleFor(frames, anims, 44)).toBeCloseTo(44 / 48);
    const s = scaleFor(frames, anims, 48);
    expect(s).toBe(1);
    const scaled = scaleFrames(applyMask(img, mask), frames, s);
    expect(scaled[0]).toMatchObject({ w: 12, h: 48, px: 6, py: 47 });
    const half = scaleFrames(applyMask(img, mask), frames, 0.5);
    expect(half[0]).toMatchObject({ w: 6, h: 24 });
  });

  it("splits zones by 16 px rows from the feet and snaps to board colors", () => {
    const { img, mask, frames } = scaledSheet();
    const scaled = scaleFrames(applyMask(img, mask), frames, 1);
    expect(zoneCount(scaled)).toBe(3);
    const z = analyzeZones(scaled);
    expect(z.zones.map((x) => x.kind)).toEqual(["head", "torso", "legs"]);
    for (const zone of z.zones) {
      expect(zone.used).toBeLessThanOrEqual(MAX_COLORS);
      expect(zone.level).toBe("ok");
      for (const hex of zone.palette) for (const ch of [1, 3, 5]) expect(parseInt(hex.slice(ch, ch + 2), 16) % 17).toBe(0);
    }
    // the legs row holds the jeans; the top row the head
    expect(z.zones[2]!.palette).toContain("#224488");
    expect(z.zones[0]!.palette).toContain("#EEAA77");
    expect(z.snapMeanDeltaE).toBeGreaterThan(0); // the dark shirt is not a board color
    expect(z.frames[0]!.rgba.length).toBe(scaled[0]!.rgba.length);
  });

  it("reduces a zone over 15 colors and names the two most alike", () => {
    const w = 20;
    const h = 16;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const g = (i % 20) * 12;
      rgba.set([g, g, 255 - g, 255], i * 4);
    }
    const f: ScaledFrame = { w, h, rgba, px: 10, py: 15 };
    const z = analyzeZones([f]);
    expect(z.zones).toHaveLength(1);
    expect(z.zones[0]!.used).toBeGreaterThan(15);
    expect(z.zones[0]!.level).toBe("over");
    expect(z.zones[0]!.palette.length).toBeLessThanOrEqual(15);
    expect(z.zones[0]!.closest).not.toBeNull();
  });

  it("packs an atlas with every frame at 1:1", () => {
    const a: ScaledFrame = { w: 3, h: 2, rgba: new Uint8Array(24).fill(255), px: 1, py: 1 };
    const b: ScaledFrame = { w: 2, h: 4, rgba: new Uint8Array(32).fill(255), px: 1, py: 3 };
    const atlas = packAtlas([a, b], ["a", "b"], 4);
    expect(atlas.rects).toEqual([
      { id: "a", x: 0, y: 0, w: 3, h: 2, px: 1, py: 1 },
      { id: "b", x: 0, y: 4, w: 2, h: 4, px: 1, py: 3 },
    ]);
    expect(atlas.w).toBe(3);
    expect(atlas.h).toBe(8);
    expect(atlas.rgba[(4 * 3 + 0) * 4 + 3]).toBe(255);
    expect(atlas.rgba[(2 * 3 + 0) * 4 + 3]).toBe(0);
  });
});

describe("character", () => {
  it("saves a character with its zone palettes, and reopens it", () => {
    const project = newProject({ title: "Test" });
    const { img, mask, frames } = scaledSheet();
    const scaled = scaleFrames(applyMask(img, mask), frames, 1);
    const z = analyzeZones(scaled);
    const atlas = packAtlas(z.frames, frames.map((f) => f.id));
    const draft = { ...emptyDraft(), name: "Willy G.", sheet: "sha256:aa" as const, file: "willy.png", frames, anims: { idle: { frames: ["f1", "f2", "gone"], fps: 6, loop: true }, walk: { frames: [], fps: 12, loop: true } } };
    const { project: p1, character } = saveCharacter(project, { draft, atlas: "sha256:bb", rects: atlas.rects, zones: z.zones });
    expect(character.id).toBe("willy-g");
    expect(character.sheet).toBe("sha256:bb");
    expect(character.anims).toEqual({ idle: { frames: ["f1", "f2"], fps: 6, loop: true } });
    expect(character.frames[0]!.zones).toEqual(["pal-willy-g-head", "pal-willy-g-torso", "pal-willy-g-legs"]);
    expect(p1.palettes.map((p) => p.id)).toEqual(["pal-willy-g-head", "pal-willy-g-torso", "pal-willy-g-legs"]);
    expect(p1.palettes.every((p) => p.group === "sprite" && p.colors.length <= 15)).toBe(true);

    const again = draftOf(p1.characters[0]!);
    expect(again).toMatchObject({ id: "willy-g", sheet: "sha256:aa", file: "willy.png", frames });
    // saving again replaces, never duplicates
    const { project: p2 } = saveCharacter(p1, { draft: again!, atlas: "sha256:cc", rects: atlas.rects, zones: z.zones });
    expect(p2.characters).toHaveLength(1);
    expect(p2.palettes).toHaveLength(3);
    expect(removeCharacter(p2, "willy-g")).toMatchObject({ characters: [], palettes: [] });
  });

  it("makes unique, plain ids", () => {
    const project = newProject({ title: "Test" });
    expect(slug("Zoë Ångström 2")).toBe("zoe-angstrom-2");
    project.characters.push({ id: "willy", name: "Willy", role: "hero", height: 44, sheet: null, frames: [], anims: {}, swapColors: [] });
    expect(uniqueCharacterId(project, "Willy", null)).toBe("willy-2");
    expect(uniqueCharacterId(project, "Willy", "willy")).toBe("willy");
  });
});

describe("i18n", () => {
  it("es and pt have exactly the English keys", () => {
    const keys = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v as object, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(SPRITES.es).sort()).toEqual(keys(SPRITES.en).sort());
    expect(keys(SPRITES.pt).sort()).toEqual(keys(SPRITES.en).sort());
  });
});
