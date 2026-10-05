// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { MAKER_STORAGE_PREFIX } from "@go-link/shared";
import { MAKER_URL } from "../config";

/** Whether this browser still keeps games Willy Maker made while it lived on this site. */
function hasOldGames(): boolean {
  try {
    return window.localStorage.getItem(`${MAKER_STORAGE_PREFIX}index`) !== null;
  } catch {
    return false;
  }
}

/** The address on Willy Maker's own site for /tools/willy-maker[/:gameId]. */
export function makerAddress(gameId: string | undefined, oldGames: boolean): string {
  const path = gameId && /^[\w-]{1,64}$/.test(gameId) ? `/${gameId}` : "/";
  return `${MAKER_URL}${path}${oldGames ? "?import=1" : ""}`;
}

/** /tools/willy-maker[/:gameId]: Willy Maker moved to its own site; old links go there. */
export function MakerRedirect() {
  const { gameId } = useParams();
  useEffect(() => {
    window.location.replace(makerAddress(gameId, hasOldGames()));
  }, [gameId]);
  return null;
}
