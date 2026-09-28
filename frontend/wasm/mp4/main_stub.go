// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !(js && wasm)

package main

// The real entry point is main.go (WebAssembly only); this one lets the
// tests run on the computer.
func main() {}
