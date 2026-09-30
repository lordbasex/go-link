// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { es } from "../i18n/es";
import { pt } from "../i18n/pt";
import { smokeSkin } from "./builtin";
import { addRecord, copyOf, emptyGuides, freeSkinId, parseLibrary, removeRecord, sortedRecords, type Library } from "./store";

const smoke = smokeSkin()!;
const suffix = { en: en.skinEditor.copySuffix, es: es.skinEditor.copySuffix, pt: pt.skinEditor.copySuffix };

describe("skin library", () => {
  it("is empty without storage or with broken data", () => {
    expect(parseLibrary(null)).toEqual({ current: null, skins: {} });
    expect(parseLibrary("{nope")).toEqual({ current: null, skins: {} });
    expect(parseLibrary('{"skin":{"format":2}}')).toEqual({ current: null, skins: {} });
  });

  it("ignores data of another shape", () => {
    expect(parseLibrary(JSON.stringify({ skin: { ...smoke, id: "mine" }, file: "skin-mine.json" }))).toEqual({ current: null, skins: {} });
  });

  it("keeps several records and drops broken ones", () => {
    const raw = JSON.stringify({
      current: "b",
      skins: {
        a: { skin: { ...smoke, id: "a" }, file: "skin-a.json", guides: emptyGuides(), updatedAt: 1 },
        b: { skin: { ...smoke, id: "b" }, file: "skin-b.json", guides: { portrait: { x: ["bad"] } }, updatedAt: 3 },
        c: { skin: { id: "c" } },
      },
    });
    const lib = parseLibrary(raw);
    expect(Object.keys(lib.skins).sort()).toEqual(["a", "b"]);
    expect(lib.current).toBe("b");
    expect(lib.skins.b!.guides).toEqual(emptyGuides());
    expect(sortedRecords(lib).map(([id]) => id)).toEqual(["b", "a"]);
  });

  it("copies a built-in skin under a free id with (copy) names", () => {
    const lib: Library = { current: null, skins: {} };
    const first = copyOf(lib, smoke, suffix, `my-${smoke.id}`);
    expect(first.id).toBe("my-smoke");
    expect(first.name.en).toBe(`${smoke.name.en} (copy)`);
    expect(first.name.es).toBe(`${smoke.name.es} ${es.skinEditor.copySuffix}`);
    addRecord(lib, { skin: first, file: "skin-my-smoke.json", guides: emptyGuides() });
    expect(copyOf(lib, smoke, suffix, "my-smoke").id).toBe("my-smoke-2");
    expect(freeSkinId(lib, "My Skin!")).toBe("my-skin");
    expect(smoke.id).toBe("smoke");
  });

  it("deletes a record and moves current to the most recent one left", () => {
    const lib: Library = { current: null, skins: {} };
    const a = addRecord(lib, { skin: { ...smoke, id: "a" }, file: "", guides: emptyGuides() }, 1);
    const b = addRecord(lib, { skin: { ...smoke, id: "b" }, file: "", guides: emptyGuides() }, 2);
    const c = addRecord(lib, { skin: { ...smoke, id: "c" }, file: "", guides: emptyGuides() }, 3);
    expect(lib.current).toBe(c);
    removeRecord(lib, a);
    expect(lib.current).toBe(c);
    removeRecord(lib, c);
    expect(lib.current).toBe(b);
    removeRecord(lib, b);
    expect(lib.current).toBeNull();
  });
});
