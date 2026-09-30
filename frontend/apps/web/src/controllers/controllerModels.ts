// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/**
 * Which controller a Gamepad API id belongs to: its brand, its model and its
 * USB vendor and product ids, from what each browser puts in the id
 * (Chrome: "Name (STANDARD GAMEPAD Vendor: 057e Product: 2009)", Firefox:
 * "057e-2009-Name", Safari: the name only). The model picks the drawing.
 */
export type ControllerModelId =
  | "switchpro"
  | "joycon"
  | "dualsense"
  | "dualshock4"
  | "xboxseries"
  | "xbox360"
  | "eightbitdo"
  | "generic";

export interface ControllerIdentity {
  model: ControllerModelId;
  /** The maker's name ("Nintendo", "Sony"…), empty when unknown. */
  brand: string;
  /** The model's usual name ("DualSense"…), or the browser's name for a generic pad. */
  modelName: string;
  /** Four lowercase hex digits each, or empty when the browser does not say. */
  vendor: string;
  product: string;
}

/** Known USB ids, vendor:product, with the model they draw. */
const PRODUCTS: Record<string, ControllerModelId> = {
  "057e:2009": "switchpro",
  "057e:2006": "joycon",
  "057e:2007": "joycon",
  "057e:200e": "joycon",
  "054c:0ce6": "dualsense",
  "054c:0df2": "dualsense",
  "054c:05c4": "dualshock4",
  "054c:09cc": "dualshock4",
  "054c:0ba0": "dualshock4",
  "045e:028e": "xbox360",
  "045e:028f": "xbox360",
  "045e:0719": "xbox360",
  "045e:02d1": "xboxseries",
  "045e:02dd": "xboxseries",
  "045e:02e0": "xboxseries",
  "045e:02ea": "xboxseries",
  "045e:02fd": "xboxseries",
  "045e:0b12": "xboxseries",
  "045e:0b13": "xboxseries",
  "045e:0b20": "xboxseries",
  "045e:0b22": "xboxseries",
};

const BRANDS: Record<string, string> = { "057e": "Nintendo", "054c": "Sony", "045e": "Microsoft", "2dc8": "8BitDo", "0f0d": "Hori", "0e6f": "PDP", "20d6": "PowerA", "1532": "Razer", "046d": "Logitech", "28de": "Valve" };

const NAMES: Record<ControllerModelId, string> = {
  switchpro: "Switch Pro Controller",
  joycon: "Joy-Con",
  dualsense: "DualSense",
  dualshock4: "DualShock 4",
  xboxseries: "Xbox Wireless Controller",
  xbox360: "Xbox 360 Controller",
  eightbitdo: "8BitDo",
  generic: "",
};

/** The vendor and product ids a browser put in the id, if any. */
export function usbIds(id: string): { vendor: string; product: string } {
  const chrome = /Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i.exec(id);
  if (chrome) return { vendor: chrome[1]!.toLowerCase(), product: chrome[2]!.toLowerCase() };
  const firefox = /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i.exec(id);
  if (firefox) return { vendor: firefox[1]!.toLowerCase().padStart(4, "0"), product: firefox[2]!.toLowerCase().padStart(4, "0") };
  return { vendor: "", product: "" };
}

/** Recognizes the controller: by its USB ids first, then by its name. */
export function identify(id: string): ControllerIdentity {
  const { vendor, product } = usbIds(id);
  let model: ControllerModelId | undefined = vendor ? PRODUCTS[`${vendor}:${product}`] : undefined;
  if (!model) {
    if (/joy-?con/i.test(id)) model = "joycon";
    else if (/pro controller/i.test(id) || vendor === "057e") model = "switchpro";
    else if (/dualsense/i.test(id)) model = "dualsense";
    else if (/dualshock|wireless controller.*054c|playstation/i.test(id) || vendor === "054c") model = "dualshock4";
    else if (/xbox 360|x360/i.test(id)) model = "xbox360";
    else if (/xbox|xinput/i.test(id) || vendor === "045e") model = "xboxseries";
    else if (/8bitdo/i.test(id) || vendor === "2dc8") model = "eightbitdo";
    else model = "generic";
  }
  const brand = BRANDS[vendor] ?? (model === "switchpro" || model === "joycon" ? "Nintendo" : model.startsWith("dual") ? "Sony" : model.startsWith("xbox") ? "Microsoft" : model === "eightbitdo" ? "8BitDo" : "");
  const name = id.replace(/\s*\((?:STANDARD GAMEPAD|Vendor:)[^)]*\)\s*/gi, " ").replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, "").trim();
  return { model, brand, modelName: NAMES[model] || name || "Gamepad", vendor, product };
}

/**
 * What a model prints on each button of the standard mapping, so help texts
 * can say "press ✕" or "press B" instead of "button 1": b1-b4 are the face
 * buttons (bottom, right, left, top), then the shoulders, triggers and the
 * two small buttons in the middle.
 */
export interface ButtonNames {
  b1: string;
  b2: string;
  b3: string;
  b4: string;
  l1: string;
  r1: string;
  l2: string;
  r2: string;
  select: string;
  start: string;
}

export function buttonNames(model: ControllerModelId): ButtonNames {
  switch (model) {
    case "switchpro":
    case "joycon":
    case "eightbitdo":
      return { b1: "B", b2: "A", b3: "Y", b4: "X", l1: "L", r1: "R", l2: "ZL", r2: "ZR", select: "−", start: "+" };
    case "dualsense":
      return { b1: "✕", b2: "○", b3: "□", b4: "△", l1: "L1", r1: "R1", l2: "L2", r2: "R2", select: "Create", start: "Options" };
    case "dualshock4":
      return { b1: "✕", b2: "○", b3: "□", b4: "△", l1: "L1", r1: "R1", l2: "L2", r2: "R2", select: "Share", start: "Options" };
    case "xboxseries":
      return { b1: "A", b2: "B", b3: "X", b4: "Y", l1: "LB", r1: "RB", l2: "LT", r2: "RT", select: "View", start: "Menu" };
    case "xbox360":
      return { b1: "A", b2: "B", b3: "X", b4: "Y", l1: "LB", r1: "RB", l2: "LT", r2: "RT", select: "Back", start: "Start" };
    default:
      return { b1: "1", b2: "2", b3: "3", b4: "4", l1: "L1", r1: "R1", l2: "L2", r2: "R2", select: "Select", start: "Start" };
  }
}
