// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Keeps the game's interface on screen: if a screen fails to draw, the error
// is logged and the interface draws again on the next frame instead of the
// whole overlay disappearing while the game goes on underneath.

import { Component, type ReactNode } from "react";

export class Guard extends Component<{ children: ReactNode }, { failed: number }> {
  state = { failed: 0 };

  static getDerivedStateFromError(): { failed: number } {
    return { failed: 1 };
  }

  componentDidCatch(error: unknown): void {
    console.error("destroy: the interface failed to draw", error);
    window.requestAnimationFrame(() => this.setState((s) => ({ failed: s.failed ? 0 : 0 })));
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
