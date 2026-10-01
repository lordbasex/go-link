// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Willy Maker's one public entry. The site mounts <WillyMakerApp lang=…/>
// (lazily, on its own route); nothing outside imports the module's insides.

export { WillyMakerApp, type WillyMakerProps } from "./ui/WillyMakerApp";
export type { MakerDevice } from "./ui/device";
export type { Lang } from "./i18n";
export { PROJECT_FORMAT, type Project } from "./model";
