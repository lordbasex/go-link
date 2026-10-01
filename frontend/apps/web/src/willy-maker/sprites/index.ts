// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The character importer's public entry: the Characters screen the shell
// mounts, and the pure helpers other parts may reuse.

export { CharactersScreen, type CharactersScreenProps } from "./CharactersScreen";
export { draftOf, saveCharacter, removeCharacter, type CharacterSource, type ImportedCharacter } from "./character";
export { keyBackground, detectFigures, gridBoxes, feetPivot } from "./detect";
export { analyzeZones, packAtlas, MAX_COLORS } from "./convert";
