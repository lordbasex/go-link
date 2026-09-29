// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Test

class InputPacketTest {
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    // Produced by the web's encodeInput (frontend/packages/shared/src/stream.ts)
    // with the same inputs: the packets must be identical byte for byte.
    @Test
    fun matchesTheWebEncoder() {
        assertEquals("000100000000001100000000", hex(InputPacket.encode(1, 0, Pad(Button.UP or Button.B1))))
        assertEquals(
            "ffff0300002008087f8140ff",
            hex(
                InputPacket.encode(
                    65535,
                    3,
                    Pad(Button.START4 or Button.COIN or Button.RIGHT, listOf(127, -127, InputPacket.axis(64.4), InputPacket.axis(-0.6))),
                ),
            ),
        )
        assertEquals(
            "11700200003fffff7f8101ff",
            hex(InputPacket.encode(70000, 6, Pad(-1, listOf(InputPacket.axis(300.0), InputPacket.axis(-300.0), 1, -1)))),
        )
        assertEquals(
            "0102020000040202ce320000",
            hex(InputPacket.encode(258, 2, Pad(Button.START1 or Button.B6 or Button.DOWN, listOf(-50, 50, 0, 0)))),
        )
    }

    @Test
    fun startButtons() {
        assertEquals(Button.START1, startOf(1))
        assertEquals(Button.START4, startOf(4))
        assertEquals(0, startOf(5))
        assertEquals(1, startButtonCount(0, 0))
        assertEquals(2, startButtonCount(2, 3))
        assertEquals(3, startButtonCount(0, 3))
    }

    @Test
    fun dpadSectors() {
        assertEquals(0, TouchPadLogic.dpadBits(0.1, 0.1))
        assertEquals(Button.RIGHT, TouchPadLogic.dpadBits(1.0, 0.0))
        assertEquals(Button.UP or Button.RIGHT, TouchPadLogic.dpadBits(0.7, -0.7))
        assertEquals(Button.RIGHT, TouchPadLogic.dpadBits(0.7, -0.6, fourWay = true))
        assertEquals(listOf(Button.B1, Button.B2, Button.B3), TouchPadLogic.actionButtons(3))
        assertEquals(6, TouchPadLogic.actionButtons(9).size)
    }

    @Test
    fun standardGamepadLikeTheWeb() {
        val pad = StandardGamepad.pad(setOf(StandardGamepad.FACE_BOTTOM, StandardGamepad.SELECT), -0.9, 0.1, 0.0, 0.0)
        assertEquals(Button.B1 or Button.COIN or Button.LEFT, pad.buttons)
        assertEquals(listOf(-114, 0, 0, 0), pad.axes)
        assertEquals(Button.START, StandardGamepad.bitOf(StandardGamepad.START))
        assertEquals(0, StandardGamepad.bitOf(40))
    }
}
