// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

type SessionType = "auto" | "playback";
type WithSession = Navigator & { audioSession?: { type: string } };

/**
 * iPhone's silent switch mutes Web Audio unless the page says it plays
 * media (Safari 17+). "playback" makes the music sound like a video does;
 * "auto" gives the choice back to the browser, which a page that uses the
 * microphone needs.
 */
export function setAudioSession(type: SessionType): void {
  const session = (navigator as WithSession).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // Older WebKit: nothing to do.
  }
}
