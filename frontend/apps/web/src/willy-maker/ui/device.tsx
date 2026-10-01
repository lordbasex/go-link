// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The owner's linked go-link device, handed in by the site (Willy Maker
// never opens a connection itself). The Export tab uses it for the ROM
// test on the device (validation level 4).

import { createContext, useContext, type ReactNode } from "react";
import type { DeviceMessages, RomTestLink } from "@go-link/shared";

export interface MakerDevice {
  /** A device is linked to this browser (it may be offline right now). */
  linked: boolean;
  /** The link to the device while it is online, else null. */
  link: RomTestLink | null;
  /** Subscribes to the device's control messages. */
  onMessage: DeviceMessages;
  /** The device's computer name, when known. */
  name?: string;
  /** Opens the site's My device page. */
  openMyDevice?: () => void;
}

/** Where My device lives on the site. */
export const MY_DEVICE_HREF = "/device";

const DeviceContext = createContext<MakerDevice | null>(null);

export function DeviceProvider({ value, children }: { value: MakerDevice | null; children: ReactNode }) {
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

/** The linked device, or null when the site gave none. */
export function useMakerDevice(): MakerDevice | null {
  return useContext(DeviceContext);
}
