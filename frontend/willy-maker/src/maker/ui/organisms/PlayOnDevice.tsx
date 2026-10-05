// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Play on my go-link (Create ROM): the game goes to the linked device,
// which opens its room with the real core, and the site opens that room.
// One room per game: sending it again replaces it (the device's MakerRom).

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { playMakerGame, type MakerGameInfo } from "@go-link/shared";
import { useExportMessages } from "../../i18n";
import { rulesWith } from "../../engine/rules";
import type { Project } from "../../model";
import { Capsule } from "../atoms";
import { MY_DEVICE_HREF, useMakerDevice } from "../device";
import { DeviceRomTest } from "./PowerOnCard";

/** The room's name, players and the buttons the game's rules use (the room's touch pad and How to play). */
export function makerGameInfo(project: Project): MakerGameInfo {
  const rules = rulesWith(project.settings.rules);
  const labels = rules.racing ? ["Gas", "Brake"] : rules.sports ? ["Kick"] : rules.versus ? ["Punch", "Kick"] : rules.quiz ? ["A", "B", "C"] : rules.puzzle ? ["Turn"] : rules.maze ? [] : rules.topdown ? ["Shoot", "Grenade", "Strafe"] : rules.crosshair ? ["Shoot", "Reload"] : rules.ship ? ["Shoot", "Bomb"] : rules.depth ? ["Punch", "Hop"] : rules.weapons ? ["Jump", "Fire", "Special"] : ["Jump"];
  return { title: project.title.trim() || "Willy Maker", players: Math.max(1, Math.min(4, project.settings.players)), labels };
}

type PlayState = { kind: "idle" } | { kind: "uploading"; pct: number } | { kind: "opening" } | { kind: "error"; message: string } | { kind: "old" };

/** Sends the game and opens its room as soon as it shows, once; a failure offers to try again. */
export function PlayOnDevice({ file, project }: { file: File; project: Project }) {
  const t = useExportMessages();
  const device = useMakerDevice();
  const [state, setState] = useState<PlayState>({ kind: "idle" });
  const alive = useRef(true);
  const started = useRef(false);
  const link = device?.link ?? null;

  const start = async () => {
    if (!device || !link) return;
    setState({ kind: "uploading", pct: 0 });
    try {
      const room = await playMakerGame(link, device.onMessage, file, makerGameInfo(project), {
        onUpload: (sent, total) => {
          if (alive.current) setState(sent >= total ? { kind: "opening" } : { kind: "uploading", pct: Math.round((sent / Math.max(1, total)) * 100) });
        },
      });
      if (!alive.current) return;
      setState({ kind: "idle" });
      device.openRoom?.(room.roomId);
    } catch (e) {
      if (!alive.current) return;
      const reason = (e as Error).message;
      // a go-link from before 0.1.9 knows no Willy Maker games
      setState(/unknown upload purpose/.test(reason) ? { kind: "old" } : { kind: "error", message: t.rom.playing.error(reason) });
    }
  };

  useEffect(() => {
    alive.current = true;
    if (link && !started.current) {
      started.current = true;
      void start();
    }
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  if (!device || !link) {
    const openMyDevice = (e: MouseEvent<HTMLAnchorElement>) => {
      if (!device?.openMyDevice) return;
      e.preventDefault();
      device.openMyDevice();
    };
    return (
      <div className="wm-device-play">
        <p className="wm-note wm-small" role="note">
          {device?.linked ? t.powerOn.device.offline : t.powerOn.device.noDevice}{" "}
          <a href={device?.myDeviceHref ?? MY_DEVICE_HREF} onClick={openMyDevice}>
            {t.powerOn.device.myDevice}
          </a>
        </p>
        {device?.connect && (
          <Capsule tone="primary" onClick={device.connect}>
            {t.powerOn.device.connect}
          </Capsule>
        )}
      </div>
    );
  }
  // a go-link before 0.1.9: it can still power the game on (validation level 4)
  if (state.kind === "old")
    return (
      <div className="wm-device-play">
        <p className="wm-note wm-small" role="note">
          {t.rom.playing.update}
        </p>
        <DeviceRomTest file={file} browserSet="slammast" />
      </div>
    );
  return (
    <div className="wm-device-play">
      {device.name && <span className="wm-chip">{t.powerOn.device.on(device.name)}</span>}
      {(state.kind === "uploading" || state.kind === "opening") && (
        <p className="wm-small wm-dim" role="status" aria-busy="true">
          {state.kind === "uploading" ? t.rom.playing.uploading(state.pct) : t.rom.playing.opening}
        </p>
      )}
      {state.kind === "error" && (
        <>
          <p className="wm-note is-error wm-small" role="alert">
            {state.message}
          </p>
          <Capsule tone="primary" onClick={() => void start()}>
            {t.rom.play}
          </Capsule>
        </>
      )}
    </div>
  );
}
