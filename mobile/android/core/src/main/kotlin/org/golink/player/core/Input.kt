// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Button bits of the "input" DataChannel. Keep in sync with
 * backend-device/pkg/input and frontend/packages/shared/src/stream.ts.
 */
object Button {
    const val UP = 1 shl 0
    const val DOWN = 1 shl 1
    const val LEFT = 1 shl 2
    const val RIGHT = 1 shl 3
    const val B1 = 1 shl 4 // bottom face button
    const val B2 = 1 shl 5 // right
    const val B3 = 1 shl 6 // left
    const val B4 = 1 shl 7 // top
    const val B5 = 1 shl 8 // L1
    const val B6 = 1 shl 9 // R1
    const val START = 1 shl 10
    const val COIN = 1 shl 11
    const val L2 = 1 shl 12
    const val R2 = 1 shl 13
    const val L3 = 1 shl 14
    const val R3 = 1 shl 15
    const val HOME = 1 shl 16
    const val CAPTURE = 1 shl 17

    // The start buttons of players 1 to 4, like the row of start buttons
    // on an arcade panel: any seated player can press any of them.
    const val START1 = 1 shl 18
    const val START2 = 1 shl 19
    const val START3 = 1 shl 20
    const val START4 = 1 shl 21

    /** All defined button bits. */
    const val MASK = (1 shl 22) - 1

    /** The action buttons of a game, in the order MAME numbers them. */
    val ACTIONS = intArrayOf(B1, B2, B3, B4, B5, B6)
    val DIRECTIONS = UP or DOWN or LEFT or RIGHT
}

/** Up to 4 people can play from one phone (touch + gamepads). */
const val MAX_LOCAL_PLAYERS = 4

/** One controller: button bits and sticks (LX, LY, RX, RY in -127..127). */
data class Pad(val buttons: Int = 0, val axes: List<Int> = listOf(0, 0, 0, 0)) {
    val isIdle: Boolean get() = buttons == 0 && axes.all { it == 0 }

    companion object {
        val EMPTY = Pad()
    }
}

object InputPacket {
    const val SIZE = 12

    /**
     * 12 bytes, big endian: uint16 sequence, uint8 local player, uint8
     * reserved, uint32 buttons, 4 x int8 stick axes. Byte for byte the
     * web's encodeInput.
     */
    fun encode(seq: Int, player: Int, pad: Pad): ByteArray {
        val b = ByteArray(SIZE)
        val s = seq and 0xffff
        b[0] = (s ushr 8).toByte()
        b[1] = s.toByte()
        b[2] = (player and 0x03).toByte()
        b[3] = 0
        val bits = pad.buttons and Button.MASK
        b[4] = (bits ushr 24).toByte()
        b[5] = (bits ushr 16).toByte()
        b[6] = (bits ushr 8).toByte()
        b[7] = bits.toByte()
        for (i in 0 until 4) {
            val a = pad.axes.getOrElse(i) { 0 }
            b[8 + i] = a.coerceIn(-127, 127).toByte()
        }
        return b
    }

    /** Stick value (-1..1 floats, as Android reports them) to -127..127, like the web. */
    fun axis(v: Double): Int = jsRound(v.coerceIn(-127.0, 127.0)).toInt()
}

/** The panel start button of a port (1-4), or 0. */
fun startOf(port: Int): Int = if (port in 1..4) Button.START1 shl (port - 1) else 0

/**
 * How many panel start buttons to show: as many as people seated, but no
 * more than the game takes (players 0 = unknown, up to 4), and at least 1.
 */
fun startButtonCount(gamePlayers: Int, seated: Int): Int {
    val game = if (gamePlayers >= 1) min(gamePlayers, 4) else 4
    return max(1, min(game, seated))
}

object TouchPadLogic {
    /** Thumb offsets inside this fraction of the pad radius press nothing. */
    const val DPAD_DEADZONE = 0.25

    /**
     * Turns a thumb position on the D-pad into direction bits. dx and dy
     * go from -1 to 1 (right and down are positive). Eight sectors of 45
     * degrees give the diagonals; a 4-way joystick only gets the dominant
     * axis, as its real stick would.
     */
    fun dpadBits(dx: Double, dy: Double, fourWay: Boolean = false): Int {
        if (hypot(dx, dy) < DPAD_DEADZONE) return 0
        if (fourWay) {
            if (abs(dx) >= abs(dy)) return if (dx < 0) Button.LEFT else Button.RIGHT
            return if (dy < 0) Button.UP else Button.DOWN
        }
        val angle = atan2(dy, dx) * 180 / Math.PI // 0 = right, 90 = down
        var bits = 0
        if (angle > -67.5 && angle < 67.5) bits = bits or Button.RIGHT
        if (angle > 112.5 || angle < -112.5) bits = bits or Button.LEFT
        if (angle > 22.5 && angle < 157.5) bits = bits or Button.DOWN
        if (angle < -22.5 && angle > -157.5) bits = bits or Button.UP
        return bits
    }

    /** Action button bits a game with this many buttons uses (0 to 6). */
    fun actionButtons(count: Int): List<Int> = Button.ACTIONS.take(count.coerceIn(0, Button.ACTIONS.size))

    /** Whether the D-pad should only allow four directions. */
    fun isFourWay(control: String): Boolean = control == "joy4way"
}

/**
 * Physical controllers, mapped like the browser's Gamepad API "standard"
 * layout (frontend/packages/shared/src/gamepad.ts): the platform turns
 * its key codes into these indexes, and this table turns them into bits.
 */
object StandardGamepad {
    const val FACE_BOTTOM = 0
    const val FACE_RIGHT = 1
    const val FACE_LEFT = 2
    const val FACE_TOP = 3
    const val L1 = 4
    const val R1 = 5
    const val L2 = 6
    const val R2 = 7
    const val SELECT = 8
    const val START = 9
    const val L3 = 10
    const val R3 = 11
    const val DPAD_UP = 12
    const val DPAD_DOWN = 13
    const val DPAD_LEFT = 14
    const val DPAD_RIGHT = 15
    const val HOME = 16
    const val CAPTURE = 17

    private val BITS = intArrayOf(
        Button.B1, Button.B2, Button.B3, Button.B4, Button.B5, Button.B6,
        Button.L2, Button.R2, Button.COIN, Button.START, Button.L3, Button.R3,
        Button.UP, Button.DOWN, Button.LEFT, Button.RIGHT, Button.HOME, Button.CAPTURE,
    )

    /** The bit of a standard button index, or 0. */
    fun bitOf(index: Int): Int = BITS.getOrElse(index) { 0 }

    /** Stick values inside this radius count as centered. */
    const val DEADZONE = 0.15

    /** Stick push that also presses the matching direction. */
    const val STICK_AS_DPAD = 0.5

    /**
     * Combines held standard buttons and the sticks (-1..1, y down) into a
     * pad: the left stick also drives the directions, since arcade games
     * are digital.
     */
    fun pad(heldIndexes: Set<Int>, lx: Double, ly: Double, rx: Double, ry: Double): Pad {
        var buttons = 0
        for (i in heldIndexes) buttons = buttons or bitOf(i)
        fun dz(v: Double) = if (abs(v) < DEADZONE) 0.0 else v.coerceIn(-1.0, 1.0)
        val axes = listOf(dz(lx), dz(ly), dz(rx), dz(ry)).map { jsRound(it * 127).toInt() }
        if (lx <= -STICK_AS_DPAD) buttons = buttons or Button.LEFT
        if (lx >= STICK_AS_DPAD) buttons = buttons or Button.RIGHT
        if (ly <= -STICK_AS_DPAD) buttons = buttons or Button.UP
        if (ly >= STICK_AS_DPAD) buttons = buttons or Button.DOWN
        return Pad(buttons, axes)
    }
}
