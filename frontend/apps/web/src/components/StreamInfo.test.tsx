// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { codecName } from "@go-link/shared";
import { StreamInfo, videoRows } from "./StreamInfo";

afterEach(cleanup);

describe("stream details", () => {
  it("shows a 2x picture with the game's size and the quality in use", async () => {
    render(
      <StreamInfo
        rttMs={12}
        sentFps={59.9}
        receivedFps={60}
        path="direct"
        video={{ scale: 2, width: 384, height: 224, quality: "high" }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Connection details" }));
    expect(screen.getByText("768×448 (2× of 384×224)")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("says when a room fell back to the game's size", () => {
    expect(videoRows({ scale: 1, width: 288, height: 224, quality: "saver", fallback: "cpu" })).toEqual([
      ["Video", "288×224"],
      ["Quality", "Saver (CPU)"],
    ]);
    // The test pattern room: its own size, no quality.
    expect(videoRows({ scale: 1, width: 640, height: 480 })).toEqual([["Video", "640×480"]]);
  });

  it("names the codec the browser decodes", async () => {
    render(<StreamInfo rttMs={3} sentFps={60} receivedFps={60} path="direct" codec="H.264" />);
    await userEvent.click(screen.getByRole("button", { name: "Connection details" }));
    expect(screen.getByText("Codec")).toBeInTheDocument();
    expect(screen.getByText("H.264")).toBeInTheDocument();
    expect([codecName("video/H264"), codecName("video/VP8"), codecName("video/AV1")]).toEqual(["H.264", "VP8", "AV1"]);
  });
});
