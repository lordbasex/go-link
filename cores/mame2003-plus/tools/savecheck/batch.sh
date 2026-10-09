#!/usr/bin/env bash
# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
#
# Runs savecheck over every zip in a folder, several games at a time, and
# writes one line per game to OUTDIR/results.txt (plus each game's JSON).
#
#   ./batch.sh CORE ROMDIR OUTDIR [savecheck options...]
#
# JOBS sets how many games run at once (default: half the CPUs). A game that
# runs longer than five minutes is stopped and reported as an error.
set -euo pipefail

if [ $# -lt 3 ]; then
	echo "usage: $0 CORE ROMDIR OUTDIR [savecheck options...]" >&2
	exit 2
fi
here="$(cd "$(dirname "$0")" && pwd)"
core="$1" roms="$2" out="$3"
shift 3
jobs="${JOBS:-$(($(getconf _NPROCESSORS_ONLN) / 2))}"
mkdir -p "$out"
: > "$out/results.txt"

one() {
	local zip="$1" core="$2" out="$3" game log line
	shift 3
	game="$(basename "$zip" .zip)"
	# perl's alarm is a timeout that macOS and Linux both have
	log="$(perl -e 'alarm shift; exec @ARGV' 300 "$SAVECHECK" --quiet --json "$out/$game.json" "$@" "$core" "$zip" 2>&1)" || true
	line="$(printf '%s\n' "$log" | grep -E '^(IDENTICAL|DIFFERENT):' | tail -1)"
	if [ -z "$line" ]; then
		line="$(printf '%s\n' "$log" | grep '^savecheck:' | head -1)"
		line="${line#savecheck: }"
		line="${line/"$core does not load $zip"/the core does not load it}"
		line="ERROR: $game.zip ${line:-stopped after five minutes}"
	fi
	echo "$line" >> "$out/results.txt"
}
export -f one
export SAVECHECK="$here/savecheck"

find "$roms" -maxdepth 1 -name '*.zip' -print0 | sort -z |
	xargs -0 -P "$jobs" -I{} bash -c 'one "$@"' _ {} "$core" "$out" "$@"

sort -o "$out/results.txt" -k2 "$out/results.txt"
grep -c '^IDENTICAL' "$out/results.txt" | sed 's/$/ identical/'
grep -c '^DIFFERENT' "$out/results.txt" | sed 's/$/ different/' || true
grep -c '^ERROR' "$out/results.txt" | sed 's/$/ errors/' || true
