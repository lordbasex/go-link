// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SignalClient, SignalError, testSignalServer, type Envelope, type Handshake } from "@go-link/shared";
import { App } from "./App";
import { useLang } from "./i18n";
import { SignalProvider } from "./signal/SignalProvider";

export const OFFICIAL = "wss://signal.test/ws";

type Reply = (env: Envelope, socket: FakeSocket) => Envelope | Envelope[] | void;

/**
 * In-memory stand-in for signalhub: every socket gets hello, and each
 * message is answered by the test's reply function.
 */
export class FakeSocket {
  static reply: Reply = () => undefined;
  static sockets: FakeSocket[] = [];
  static counter = 0;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Envelope[] = [];
  closed = false;
  readonly peerId: string;

  constructor(readonly url: string) {
    FakeSocket.sockets.push(this);
    this.peerId = `peer${++FakeSocket.counter}`.padEnd(32, "0");
    queueMicrotask(() => this.push({ type: "hello", peer_id: this.peerId, ice_servers: [{ urls: ["stun:stun.test:3478"] }] }));
  }
  send(data: string) {
    const env = JSON.parse(data) as Envelope;
    this.sent.push(env);
    const out = FakeSocket.reply(env, this);
    const list = out === undefined ? [] : Array.isArray(out) ? out : [out];
    queueMicrotask(() => list.forEach((e) => this.push(e)));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
  push(env: Envelope) {
    if (!this.closed) this.onmessage?.({ data: JSON.stringify(env) });
  }
  static reset(reply: Reply = () => undefined) {
    FakeSocket.reply = reply;
    FakeSocket.sockets = [];
  }
  static allSent(): Envelope[] {
    return FakeSocket.sockets.flatMap((s) => s.sent);
  }
}

export function renderApp(path: string, { demo = false, panelUrl = "" } = {}) {
  const createClient = (url: string, handshake?: Handshake) =>
    new SignalClient({ url, handshake, WebSocketImpl: FakeSocket as unknown as typeof WebSocket, minBackoffMs: 5, maxBackoffMs: 10, requestTimeoutMs: 500 });
  // Hosts named "down" never answer; every other host behaves like signalhub.
  const testServer = (url: string) =>
    url.includes("down") ? Promise.reject(new SignalError("could not connect", false)) : testSignalServer(url, 500, FakeSocket as unknown as typeof WebSocket);
  // Like LangRoot in main.tsx: a language change re-renders the tree.
  function Root() {
    useLang();
    return (
      <MemoryRouter initialEntries={[path]}>
        <SignalProvider defaultUrl={OFFICIAL} demo={demo} storage={localStorage} createClient={createClient} testServer={testServer} panelUrl={panelUrl}>
          <App />
        </SignalProvider>
      </MemoryRouter>
    );
  }
  return render(<Root />);
}
