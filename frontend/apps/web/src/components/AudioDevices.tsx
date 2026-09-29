// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useState } from "react";
import { t } from "../i18n";
import { InfoIcon, MicIcon, SoundOnIcon } from "./Icons";
import { isAppleMobile, playTestTone, type AudioDevices as Devices } from "../signal/useAudioDevices";

const METER_BARS = 8;

/**
 * The Devices block of the room's volume and voice settings: which
 * microphone talks (with a test meter) and where the room's sound plays.
 * Where the browser cannot choose an output (iPhone, iPad, Safari) it
 * says where to change it instead.
 */
export function AudioDevicesBlock({
  devices,
  showMic,
  micLevel,
}: {
  devices: Devices;
  /** Only seated players talk, so only they choose a microphone. */
  showMic: boolean;
  /** The test level of the open microphone, null while it is not open. */
  micLevel: number | null;
}) {
  const [testing, setTesting] = useState(false);
  const inputs = devices.inputs.filter((d) => d.id !== "");
  const outputs = devices.outputs.filter((d) => d.id !== "");
  const hidden = devices.inputs.some((d) => !d.label) || (showMic && inputs.length === 0 && devices.inputs.length > 0);
  const lit = micLevel === null ? 0 : Math.round(micLevel * METER_BARS);
  const test = () => {
    setTesting(true);
    void playTestTone(devices.outId).finally(() => setTesting(false));
  };
  return (
    <div className="audio-devices">
      <div className="audio-divider" aria-hidden="true">
        <span>{t.audio.devices}</span>
      </div>
      {showMic && (
        <div className="audio-field">
          <label htmlFor="audio-in" className="audio-label">
            <MicIcon size={16} />
            {t.audio.microphone}
          </label>
          <span className="audio-select-wrap">
            <select
              id="audio-in"
              className="audio-select"
              value={devices.micId}
              onChange={(e) => devices.setMic(e.target.value)}
            >
              <option value="">{t.audio.systemDefault}</option>
              {inputs.map((d, i) => (
                <option key={d.id} value={d.id}>
                  {d.label || t.audio.micN(i + 1)}
                </option>
              ))}
            </select>
          </span>
          {hidden && <span className="small faint">{t.audio.namesHint}</span>}
          {micLevel !== null && (
            <div className="audio-test-meter">
              <span className="small faint">{t.audio.speakToTest}</span>
              <span className="audio-meter" role="img" aria-label={t.audio.micTestLevel}>
                {Array.from({ length: METER_BARS }, (_, i) => (
                  <i key={i} className={i < lit ? "is-lit" : ""} />
                ))}
              </span>
            </div>
          )}
        </div>
      )}
      <div className="audio-field">
        {devices.outputSupported ? (
          <>
            <label htmlFor="audio-out" className="audio-label">
              <SoundOnIcon size={16} />
              {t.audio.output}
            </label>
            <div className="audio-row">
              <span className="audio-select-wrap">
                <select
                  id="audio-out"
                  className="audio-select"
                  value={devices.outId}
                  onChange={(e) => devices.setOut(e.target.value)}
                >
                  <option value="">{t.audio.systemDefault}</option>
                  {outputs.map((d, i) => (
                    <option key={d.id} value={d.id}>
                      {d.label || t.audio.outputN(i + 1)}
                    </option>
                  ))}
                </select>
              </span>
              <button
                type="button"
                className="button button-secondary audio-test"
                title={t.audio.testOutput}
                disabled={testing}
                onClick={test}
              >
                {t.audio.test}
              </button>
            </div>
            {devices.canPickOutput && (
              <button type="button" className="button button-ghost audio-pick" onClick={devices.pickOutput}>
                {t.audio.chooseOutput}
              </button>
            )}
          </>
        ) : (
          <>
            <span className="audio-label">
              <SoundOnIcon size={16} />
              {t.audio.output}
            </span>
            <p className="audio-note">
              <InfoIcon />
              <span>{isAppleMobile() ? t.audio.iosNote : t.audio.systemNote}</span>
            </p>
            <button type="button" className="button button-secondary audio-test-wide" disabled={testing} onClick={test}>
              {t.audio.testSound}
            </button>
          </>
        )}
      </div>
      <span className="small faint audio-remembered">{t.audio.remembered}</span>
    </div>
  );
}
