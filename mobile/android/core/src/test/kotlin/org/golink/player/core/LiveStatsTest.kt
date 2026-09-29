// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LiveStatsTest {
    @Test
    fun ratesComeFromTheLastInterval() {
        val m = LiveStatsMeter()
        val first = m.update(
            RtcSample(
                atMs = 0.0, framesDecoded = 100, frameWidth = 640, frameHeight = 480, videoMime = "video/VP8",
                packetsReceived = 1000, packetsLost = 10, audioMime = "audio/opus", audioClockRate = 48000,
                rttSeconds = 0.028, localCandidateType = "host", remoteCandidateType = "prflx",
            ),
        )
        assertNull(first.fps) // one sample says nothing about a rate
        assertNull(first.lossPercent)
        assertEquals(28, first.rttMs)
        assertEquals(NetPath.DIRECT, first.path)
        assertEquals("VP8", first.codec)
        assertEquals("Opus", first.audioCodec)
        assertEquals(48, first.audioKhz)

        val next = m.update(RtcSample(atMs = 1000.0, framesDecoded = 160, packetsReceived = 1198, packetsLost = 12, localCandidateType = "relay"))
        assertEquals(60, next.fps)
        assertEquals(1.0, next.lossPercent!!, 1e-9) // 2 lost of 200
        assertEquals(NetPath.RELAY, next.path)
        assertNull(next.width)

        m.reset()
        assertNull(m.update(RtcSample(atMs = 2000.0, framesDecoded = 220)).fps)
    }

    @Test
    fun formatsLossAndCodecs() {
        assertEquals("0", LiveStatsMeter.formatLoss(0.0))
        assertEquals("0.4", LiveStatsMeter.formatLoss(0.4))
        assertEquals("2", LiveStatsMeter.formatLoss(2.0))
        assertEquals("12", LiveStatsMeter.formatLoss(12.4))
        assertEquals("H264", LiveStatsMeter.codecName("video/h264"))
        assertNull(LiveStatsMeter.codecName(null))
        assertEquals(NetPath.UNKNOWN, LiveStatsMeter().update(RtcSample(atMs = 0.0)).path)
    }

    @Test
    fun latencyMeterKeepsAWindow() {
        val l = LatencyMeter(window = 3)
        assertNull(l.average)
        l.add(10.0)
        l.add(20.0)
        l.add(-1.0) // ignored
        l.add(5000.0) // ignored
        l.add(30.0)
        l.add(40.0)
        assertEquals(3, l.count)
        assertEquals(20.0, l.min!!, 0.0)
        assertEquals(30.0, l.average!!, 1e-9)
        assertEquals(40.0, l.last!!, 0.0)
    }
}
