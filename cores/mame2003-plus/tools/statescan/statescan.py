#!/usr/bin/env python3
# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
"""statescan: which parts of each game a mame2003-plus save state leaves out.

Reads the core's source (no build needed) and, for every game, collects the
parts that make its board: the driver file, the machine, video and sound
hardware files it calls, its CPUs and its sound chips. In each part it lists
the file-scope variables that hold state (not constants, not pointers) and
are never named in a state_save_register call. A part with such variables is
a suspect: a save state may resume the game without them.

It is a source reading, not a proof: a variable set once at start (a config
value) is listed too, and a part saved some other way looks unsaved. Use it
to rank where to look, then check a game with savecheck.

    statescan.py SRC [--games a,b,c] [--json FILE] [--top N]

SRC is the core's src/ folder. Without --games it ranks the parts by the
number of games that use them.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict

REGISTER = re.compile(r"state_save_register_\w+\s*\(([^;]*)\)\s*;", re.S)
IDENT = re.compile(r"[A-Za-z_]\w*")
KEYWORDS = {
    "static", "const", "unsigned", "signed", "int", "char", "short", "long",
    "float", "double", "void", "struct", "union", "enum", "extern", "volatile",
    "INT8", "UINT8", "INT16", "UINT16", "INT32", "UINT32", "INT64", "UINT64",
    "data8_t", "data16_t", "data32_t", "offs_t", "size_t", "mame_timer",
}
C_WORDS = {"if", "while", "for", "switch", "return", "sizeof", "else", "do"}
DEF_MACROS = (
    "VIDEO_START", "VIDEO_UPDATE", "VIDEO_EOF", "VIDEO_STOP", "MACHINE_INIT",
    "MACHINE_STOP", "DRIVER_INIT", "PALETTE_INIT", "NVRAM_HANDLER",
    "INTERRUPT_GEN",
)
MDRV_REF = {
    "MDRV_VIDEO_START": "VIDEO_START", "MDRV_VIDEO_UPDATE": "VIDEO_UPDATE",
    "MDRV_VIDEO_EOF": "VIDEO_EOF", "MDRV_VIDEO_STOP": "VIDEO_STOP",
    "MDRV_MACHINE_INIT": "MACHINE_INIT", "MDRV_MACHINE_STOP": "MACHINE_STOP",
    "MDRV_PALETTE_INIT": "PALETTE_INIT", "MDRV_NVRAM_HANDLER": "NVRAM_HANDLER",
    "MDRV_CPU_VBLANK_INT": "INTERRUPT_GEN", "MDRV_CPU_PERIODIC_INT": "INTERRUPT_GEN",
}


def strip_source(text):
    """Removes comments and #if 0 blocks, keeping line breaks."""
    text = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    out, depth = [], 0
    for line in text.split("\n"):
        s = line.strip()
        if depth:
            if re.match(r"#\s*if", s):
                depth += 1
            elif re.match(r"#\s*endif", s):
                depth -= 1
            elif re.match(r"#\s*(else|elif)", s) and depth == 1:
                depth = 0
            out.append("")
            continue
        if re.match(r"#\s*if\s+0\b", s):
            depth = 1
            out.append("")
            continue
        out.append(line)
    return "\n".join(out)


def read(path):
    with open(path, encoding="latin-1") as f:
        return strip_source(f.read())


def top_level(text):
    """Yields the statements at file scope, one line each.

    A function definition comes as its head plus " {". A declaration with a
    braced part (a struct, a typedef, an initialised table) comes whole, with
    the braced part as "{}", up to its ";".
    """
    depth, cur, block = 0, [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("#"):
            continue
        for ch in line:
            if ch == "{":
                if depth == 0:
                    head = "".join(cur).strip()
                    if re.search(r"\)\s*$", head) and not re.search(r"=|\b(typedef|struct|union|enum)\b", head.split("(")[0]):
                        yield head + " {"
                        cur, block = [], False
                    else:
                        cur.append("{}")
                        block = True
                depth += 1
            elif ch == "}":
                depth -= 1
            elif depth == 0:
                if not block and cur == [] and ch in " \t":
                    continue
                cur.append(ch)
                if ch == ";":
                    yield "".join(cur).strip()
                    cur, block = [], False
        if depth == 0:
            cur.append(" ")
            if not block and not "".join(cur).strip():
                cur = []


def state_variables(text):
    """File-scope variables that can change: not const, not pointers, not functions."""
    names = []
    for stmt in top_level(text):
        if not stmt.endswith(";"):
            continue
        decl = re.sub(r"=.*", "", stmt, flags=re.S).rstrip(";")
        if "(" in decl or re.match(r"(extern|typedef)\b", decl) or re.search(r"\bconst\b", decl):
            continue
        if "{}" in decl:
            decl = decl.split("{}")[-1]  # the declarators after a struct body
        for part in decl.split(","):
            part = re.sub(r"\[[^\]]*\]", "", part).strip()
            if "*" in part:
                continue
            ids = [i for i in IDENT.findall(part) if i not in KEYWORDS]
            if ids:
                names.append(ids[-1])
    return names


def function_bodies(text):
    """Yields (name, body) for every function at file scope."""
    depth, cur, start, name = 0, [], 0, None
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "{":
            if depth == 0:
                head = "".join(cur).strip().split(";")[-1].strip()
                m = re.search(r"(\w+)\s*\(([^()]*)\)\s*$", head)
                name = None
                if m and "=" not in head:
                    name = m.group(2).strip() if m.group(1) in DEF_MACROS else m.group(1)
                    if m.group(1) in DEF_MACROS:
                        name = m.group(1).lower() + "_" + name
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                if name:
                    yield name, text[start:i + 1]
                cur, name = [], None
        elif depth == 0:
            if ch == "\n" and text[i + 1:i + 2] == "#":
                j = text.find("\n", i + 1)
                i = j if j > 0 else len(text)
                cur.append("\n")
                continue
            cur.append(ch)
        i += 1


STARTUP = re.compile(r"(start|init|setup|reset|stop|layout|config)", re.I)


WRITE = re.compile(
    r"\b(\w+)(?:\s*\[[^\]\n]*\])*(?:\s*(?:\.|->)\s*\w+(?:\s*\[[^\]\n]*\])*)*\s*(?:[-+*/|&^%]|<<|>>)?=(?!=)"
    r"|(?:\+\+|--)\s*(\w+)"
    r"|\b(\w+)(?:\s*\[[^\]\n]*\])*\s*(?:\+\+|--)"
    r"|\b(?:memset|memcpy)\s*\(\s*&?\s*(\w+)"
)


def written_names(body):
    return {g for m in WRITE.finditer(body) for g in m.groups() if g}


def changing(text, names):
    """The names written by a function that does not only set the board up."""
    w = set()
    for n, b in function_bodies(text):
        if not STARTUP.search(n):
            w |= written_names(b)
    return [v for v in names if v in w]


def saved_names(text):
    """Names given to state_save_register, directly or through a table of
    addresses (&name) in the function that registers them."""
    names = set()
    for m in REGISTER.finditer(text):
        names.update(IDENT.findall(m.group(1)))
    bodies = dict(function_bodies(text))
    for body in bodies.values():
        if "state_save_register" in body:
            names.update(re.findall(r"&\s*(\w+)", body))
    # a function run after loading rebuilds what it writes from saved state
    for fn in re.findall(r"state_save_register_func_postload\s*\(\s*(\w+)", text):
        if fn in bodies:
            names |= written_names(bodies[fn])
    return names


class Part:
    """One file (or a CPU's folder) and its unsaved state variables."""

    def __init__(self, key, files):
        self.key = key
        self.files = files
        self._unsaved = None

    @property
    def unsaved(self):
        if self._unsaved is None:
            self._load()
        return self._unsaved

    @property
    def registers(self):
        if self._unsaved is None:
            self._load()
        return self._registers

    def _load(self):
        files = self.files
        self._unsaved = []
        self._registers = False
        texts = {f: read(f) for f in files}
        saved = set()
        for t in texts.values():
            saved |= saved_names(t)
            if "state_save_register" in t:
                self._registers = True
        for f, t in texts.items():
            for v in changing(t, state_variables(t)):
                if v not in saved and v not in self._unsaved:
                    self._unsaved.append(v)


def definitions(text):
    """Names this file defines: macro-made functions and plain functions."""
    keys = set()
    for stmt in top_level(text):
        if not stmt.endswith("{"):
            continue
        head = stmt[:-1].strip()
        m = re.match(r"(?:static\s+)?(\w+)\s*\(\s*(\w+)\s*\)\s*$", head)
        if m and m.group(1) in DEF_MACROS:
            keys.add((m.group(1), m.group(2)))
            continue
        m = re.match(r"(?:static\s+)?(?:READ|WRITE)(?:8|16|32)?_HANDLER\s*\(\s*(\w+)\s*\)", head)
        if m:
            keys.add(("fn", m.group(1)))
            continue
        m = re.match(r"((?:\w+[\s\*]+)+)(\w+)\s*\([^()]*\)\s*$", head)
        if m and not head.startswith("static") and not m.group(2).isupper() and m.group(2) not in C_WORDS:
            keys.add(("fn", m.group(2)))
    return keys


def references(text):
    keys = {("fn", i) for i in IDENT.findall(text)}
    for mac, kind in MDRV_REF.items():
        for m in re.finditer(mac + r"\s*\(\s*(\w+)", text):
            keys.add((kind, m.group(1)))
    for m in re.finditer(r"\bDRIVER_INIT\s*\(\s*(\w+)\s*\)|\bGAME\w*\s*\(([^)]*)\)", text):
        if m.group(1):
            keys.add(("DRIVER_INIT", m.group(1)))
        else:
            args = [a.strip() for a in m.group(2).split(",")]
            if len(args) > 5:
                keys.add(("DRIVER_INIT", args[5]))
    return keys


def sound_parts(src):
    """SOUND_X -> the files of that chip (the start function's file and the chip files it includes)."""
    table = read(os.path.join(src, "sndintrf.c"))
    starts = {}
    for m in re.finditer(r"\{\s*SOUND_(\w+)\s*,\s*\"[^\"]*\"\s*,[^,]*,[^,]*,\s*(\w+)\s*,", table):
        starts[m.group(1)] = m.group(2)
    sdir = os.path.join(src, "sound")
    texts = {f: read(os.path.join(sdir, f)) for f in os.listdir(sdir) if f.endswith(".c")}
    parts = {}
    for chip, fn in starts.items():
        home = [f for f, t in texts.items() if re.search(r"\b" + fn + r"\s*\([^;]*\)\s*\{", t)]
        if not home:
            continue
        files = set(home)
        for h in home:
            for inc in re.findall(r'#include\s+"(\w+)\.h"', texts[h]):
                if inc + ".c" in texts:
                    files.add(inc + ".c")
        parts[chip] = sorted(os.path.join(sdir, f) for f in files)
    return parts


def cpu_parts(src):
    """CPU_X -> the .c files of the folder that defines that CPU."""
    table = read(os.path.join(src, "cpuintrf.c"))
    prefixes = {m.group(1): m.group(2) for m in re.finditer(r"\bCPU\w?\(\s*(\w+)\s*,\s*(\w+)\s*,", table)}
    cdir = os.path.join(src, "cpu")
    owner = {}
    for d in os.listdir(cdir):
        p = os.path.join(cdir, d)
        if not os.path.isdir(p):
            continue
        for f in os.listdir(p):
            if f.endswith(".c"):
                for m in re.finditer(r"\b(\w+)_execute\s*\(\s*int\s+\w+\s*\)", read(os.path.join(p, f))):
                    owner.setdefault(m.group(1), p)
    parts = {}
    for cpu, prefix in prefixes.items():
        d = owner.get(prefix)
        if d:
            parts[cpu] = sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith(".c") and "dasm" not in f)
    return parts


def machine_drivers(texts):
    """Machine driver name -> (cpus, sounds, refs, imports), from every driver file."""
    out = {}
    for f, t in texts.items():
        for m in re.finditer(r"MACHINE_DRIVER_START\s*\(\s*(\w+)\s*\)(.*?)MACHINE_DRIVER_END", t, re.S):
            body = m.group(2)
            out[m.group(1)] = (
                set(re.findall(r"MDRV_CPU_(?:ADD|ADD_TAG|REPLACE)\s*\((?:\s*\"\w+\"\s*,)?\s*(\w+)", body)),
                set(re.findall(r"MDRV_SOUND_(?:ADD|ADD_TAG|REPLACE)\s*\((?:\s*\"\w+\"\s*,)?\s*(\w+)", body)),
                references(body),
                re.findall(r"MDRV_IMPORT_FROM\s*\(\s*(\w+)", body),
                f,
            )
    return out


def resolve(name, mds, seen=None):
    seen = seen or set()
    if name in seen or name not in mds:
        return set(), set(), set()
    seen.add(name)
    cpus, sounds, refs, imports, _ = mds[name]
    cpus, sounds, refs = set(cpus), set(sounds), set(refs)
    for i in imports:
        c, s, r = resolve(i, mds, seen)
        cpus |= c
        sounds |= s
        refs |= r
    return cpus, sounds, refs


def scan(src):
    ddir = os.path.join(src, "drivers")
    dtexts = {os.path.join(ddir, f): read(os.path.join(ddir, f)) for f in sorted(os.listdir(ddir)) if f.endswith(".c")}
    hw = {}
    for sub in ("machine", "vidhrdw", "sndhrdw"):
        d = os.path.join(src, sub)
        for f in sorted(os.listdir(d)):
            if f.endswith(".c"):
                p = os.path.join(d, f)
                hw[p] = read(p)
    defs = defaultdict(set)
    for p, t in hw.items():
        for k in definitions(t):
            defs[k].add(p)

    sparts, cparts = sound_parts(src), cpu_parts(src)
    mds = machine_drivers(dtexts)
    cache = {}

    def part(key, files):
        if key not in cache:
            cache[key] = Part(key, files)
        return cache[key]

    games = {}
    for f, t in dtexts.items():
        refs_file = references(t)
        for m in re.finditer(r"^\s*GAME\w*\s*\(([^)]*)\)", t, re.M):
            args = [a.strip() for a in m.group(1).split(",")]
            if len(args) < 6:
                continue
            name, machine = args[1], args[3]
            cpus, sounds, refs = resolve(machine, mds)
            files = {f}
            for k in refs | refs_file:
                hits = defs.get(k, ())
                if len(hits) <= 2:  # a name defined in many files is a common word
                    files |= set(hits)
            parts = [part("driver:" + os.path.relpath(p, src), [p]) for p in sorted(files)]
            parts += [part("cpu:" + c, cparts[c]) for c in sorted(cpus) if c in cparts]
            parts += [part("sound:" + s, sparts[s]) for s in sorted(sounds) if s in sparts]
            games[name] = parts
    return games


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("src", help="the core's src/ folder")
    ap.add_argument("--games", help="comma separated set names to report")
    ap.add_argument("--json", help="also write the result as JSON")
    ap.add_argument("--top", type=int, default=40, help="parts in the ranking (default 40)")
    a = ap.parse_args()

    games = scan(a.src)
    if a.games:
        wanted = [g for g in a.games.split(",") if g]
        result = {}
        for g in wanted:
            parts = games.get(g)
            if parts is None:
                print(f"{g:10} not in this core")
                continue
            sus = [p for p in parts if p.unsaved]
            result[g] = {p.key: p.unsaved for p in sus}
            print(f"{g:10} {len(sus)} suspect parts of {len(parts)}")
            for p in sus:
                more = "" if len(p.unsaved) <= 6 else f" (+{len(p.unsaved) - 6})"
                print(f"    {p.key:40} {', '.join(p.unsaved[:6])}{more}")
    else:
        users = defaultdict(list)
        keyed = {}
        for g, parts in games.items():
            for p in parts:
                if p.unsaved:
                    users[p.key].append(g)
                    keyed[p.key] = p
        ranking = sorted(users, key=lambda k: (-len(users[k]), k))
        print(f"{len(games)} games, {len(users)} parts with unsaved state")
        for k in ranking[: a.top]:
            p = keyed[k]
            more = "" if len(p.unsaved) <= 5 else f" (+{len(p.unsaved) - 5})"
            print(f"{len(users[k]):5}  {k:40} {', '.join(p.unsaved[:5])}{more}")
        result = {k: {"games": len(users[k]), "unsaved": keyed[k].unsaved, "registers": keyed[k].registers} for k in ranking}
    if a.json:
        with open(a.json, "w") as f:
            json.dump(result, f, indent=1)


if __name__ == "__main__":
    sys.exit(main())
