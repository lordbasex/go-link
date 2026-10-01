# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
"""The Laya player of experiment 1 (docs/experiments/harness.md).

A player for run.mjs's stdin/stdout protocol that asks a local Laya
decision model (convaiinnovations/laya-multilingual, Apache 2.0) one typed
question per decision: the game state as JSON plus "next action?" over the
closed list of actions. The model answers in one forward pass with a
probability per action; the most likely one is played (argmax, so the
same states give the same actions) and every decision is logged with its
probabilities.

    ~/go-link-lab/venv/bin/python rom/tools/lab/laya_player.py \
        [--model ~/go-link-lab/models/laya-multilingual] [--device cpu]

The state given to the model is what a player sees, described from the
player's point of view: its position and pose, the nearest goal and enemy
as distances, and the cells around it (a ladder, a wall, a ledge above, a
gap ahead) read from the collision map. No route or advice from the bot.

If the model cannot be loaded, the player answers the first state with an
"error" field and exits, so the runner records the failure; it never
falls back to another way of choosing.
"""
import argparse
import json
import os
import sys
import time
import traceback

ACTIONS = {
    "right": "walk right",
    "left": "walk left",
    "jump": "jump forward (up to 64 px high) to reach a ledge above or cross a gap",
    "run_right": "run right, fast, on open floor",
    "fire": "shoot the gun forward (a knife when the enemy is adjacent)",
    "climb_up": "climb up the ladder you are standing at",
    "climb_down": "climb down the ladder under you",
    "drop": "drop down through the one-way ledge you stand on",
    "wait": "do nothing for a moment",
}
QUESTION = (
    "You control `you` in a 2D side-scrolling arcade platform game (y grows downward, "
    "units are pixels, one cell is 16 px). Reach `goal` (rescue civilians by touching "
    "them, defeat enemies, reach the exit) and shoot enemies on your floor in front of "
    "you. What is the next action?"
)
CELL = {".": 0, "#": 1, "=": 2, "H": 3, "C": 4}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


class World:
    def __init__(self):
        self.rows = None

    def set_map(self, m):
        self.rows = [[CELL.get(ch, 0) for ch in row] for row in m["rows_text"]]
        self.cols, self.nrows = m["cols"], m["rows"]

    def at(self, c, r):
        if self.rows is None:
            return 0
        if c < 0 or c >= self.cols or r >= self.nrows:
            return 1
        if r < 0:
            return 0
        return self.rows[r][c]


def solid(t):
    return t in (1, 4)


def describe(msg, world):
    lab = msg["lab"]
    me = lab["players"][msg["port"] - 1]
    x, y = me["x"], me["y"]
    c, r = x >> 4, y >> 4
    facing = "right" if me["facing"] >= 0 else "left"
    you = {"x": x, "y": y, "state": me["state"], "facing": facing, "on_ground": me["ground"],
           "on_ladder": me["climbing"], "energy": me["energy"], "score": me["score"]}

    goals = []
    for v in lab["civilians"]:
        if not v["rescued"]:
            goals.append(("rescue civilian", v["x"], v["y"]))
    if lab["flags"]["exit"]:
        for e in lab["enemies"]:
            if e["alive"]:
                goals.append(("defeat enemy", e["x"], e["y"]))
        if lab["exit"]["x0"] >= 0 and not any(e["alive"] for e in lab["enemies"]):
            goals.append(("reach the exit", (lab["exit"]["x0"] + lab["exit"]["x1"]) // 2, lab["exit"]["y"]))
    goal = None
    if goals:
        kind, gx, gy = min(goals, key=lambda g: abs(g[1] - x) + 2 * abs(g[2] - y))
        goal = {"what": kind, "dx": gx - x, "dy": gy - y,
                "where": ("right" if gx > x else "left") + (", above" if gy < y - 8 else ", below" if gy > y + 8 else ", same floor")}

    enemy = None
    alive = [e for e in lab["enemies"] if e["alive"]]
    if alive:
        e = min(alive, key=lambda e: abs(e["x"] - x) + 2 * abs(e["y"] - y))
        same = abs(e["y"] - y) < 16
        enemy = {"dx": e["x"] - x, "dy": e["y"] - y, "same_floor": same,
                 "in_front": same and ((e["x"] - x) * (1 if facing == "right" else -1)) > 0,
                 "hits_left": e["hp"]}

    around = {}
    if world.rows is not None:
        ahead = 1 if facing == "right" else -1
        around = {
            "ladder_here_going_up": world.at(c, r - 1) == 3,
            "ladder_below_going_down": world.at(c, r) == 3,
            "standing_on_one_way_ledge": world.at(c, r) == 2,
            "wall_right": solid(world.at(c + 1, r - 1)),
            "wall_left": solid(world.at(c - 1, r - 1)),
            "ledge_above_within_64px": any(world.at(cc, rr) == 2 for cc in (c - 1, c, c + 1) for rr in range(r - 4, r)),
            "gap_ahead": not any(world.at(c + ahead, rr) for rr in range(r, r + 3)),
        }
    return {"you": you, "goal": goal, "nearest_enemy": enemy, "around": around,
            "last_action": msg.get("last_action"),
            "level": {"width": lab["level"]["w"], "height": lab["level"]["h"]}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.path.expanduser("~/go-link-lab/models/laya-multilingual"))
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--seed", type=int, default=None,
                    help="sample the action from the model's probabilities with this seed (default: always the most likely)")
    args = ap.parse_args()

    agent, why = None, None
    t0 = time.time()
    try:
        os.environ.setdefault("USE_TF", "0")
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        import laya  # noqa: E402  (imported here so a missing package is reported, not a crash)
        if not os.path.isdir(args.model):
            raise FileNotFoundError("the model folder %s does not exist (see docs/experiments/harness.md)" % args.model)
        agent = laya.load(args.model, device=args.device)
        log("laya: loaded %s on %s in %.1f s" % (args.model, args.device, time.time() - t0))
    except Exception as e:  # reported to the runner on the first state
        why = "laya could not be loaded: %s: %s" % (type(e).__name__, e)
        log(why)
        log(traceback.format_exc())

    rng = None
    if args.seed is not None:
        import random
        rng = random.Random(args.seed)
    world = World()
    questions = {"next_action": {"type": "choice", "instructions": QUESTION, "criteria": ACTIONS}}
    for line in sys.stdin:
        if not line.strip():
            continue
        msg = json.loads(line)
        kind = msg.get("type")
        if kind == "hello":
            unknown = [a for a in msg.get("actions", []) if a not in ACTIONS]
            if unknown:
                why = why or "the runner offers actions this player does not know: %s" % unknown
            continue
        if kind == "end":
            log("laya: end %s" % json.dumps(msg.get("summary")))
            return 0
        if kind != "state":
            continue
        if why:
            print(json.dumps({"error": why}), flush=True)
            return 1
        if msg.get("map"):
            world.set_map(msg["map"])
        state = describe(msg, world)
        t = time.time()
        try:
            res = agent.predict(state, questions)
        except Exception as e:
            print(json.dumps({"error": "laya failed to answer: %s: %s" % (type(e).__name__, e)}), flush=True)
            return 1
        ans = res["answers"]["next_action"]
        probs = ans["probabilities"]
        choice = ans["choice"]
        if rng is not None:
            keys = list(probs.keys())
            w = [max(probs[k], 0.0) for k in keys]
            choice = rng.choices(keys, weights=w, k=1)[0]
        print(json.dumps({
            "action": choice,
            "prob": probs[choice],
            "argmax": ans["choice"],
            "probabilities": probs,
            "confidence": ans["confidence"],
            "model_ms": round((time.time() - t) * 1000),
            "tokens": res["usage"]["input_tokens"],
            "state": state,
        }), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
