// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.input

import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import org.golink.player.core.MAX_LOCAL_PLAYERS
import org.golink.player.core.Pad
import org.golink.player.core.StandardGamepad
import kotlin.math.abs

/**
 * Bluetooth and USB controllers, read from Android key and motion events
 * and mapped like the browser's "standard" Gamepad layout, so they play
 * exactly as on the website. Each controller is a local player in the order
 * it was first used (the first one shares player 0 with the on-screen
 * gamepad), up to four.
 */
class GamepadInput(private val onChange: () -> Unit) {
    private class Device(val player: Int, val name: String) {
        val held = HashSet<Int>()
        var lx = 0.0
        var ly = 0.0
        var rx = 0.0
        var ry = 0.0
        var hatX = 0.0
        var hatY = 0.0
    }

    private val devices = LinkedHashMap<Int, Device>()

    data class Controller(val player: Int, val name: String)

    /** Controllers in use, with their local player. */
    val controllers: List<Controller> get() = devices.values.map { Controller(it.player, it.name) }

    /** The pad of each local player (index 0..3) from the controllers. */
    fun pads(): List<Pad> = List(MAX_LOCAL_PLAYERS) { player ->
        var buttons = 0
        val axes = intArrayOf(0, 0, 0, 0)
        for (d in devices.values) {
            if (d.player != player) continue
            val held = HashSet(d.held)
            // A hat (D-pad reported as axes) presses the directions.
            if (d.hatX <= -0.5) held += StandardGamepad.DPAD_LEFT
            if (d.hatX >= 0.5) held += StandardGamepad.DPAD_RIGHT
            if (d.hatY <= -0.5) held += StandardGamepad.DPAD_UP
            if (d.hatY >= 0.5) held += StandardGamepad.DPAD_DOWN
            val pad = StandardGamepad.pad(held, d.lx, d.ly, d.rx, d.ry)
            buttons = buttons or pad.buttons
            pad.axes.forEachIndexed { i, a -> if (a != 0) axes[i] = a }
        }
        Pad(buttons, axes.toList())
    }

    /** Handles a key; true when it was a controller's. */
    fun onKey(event: KeyEvent): Boolean {
        if (!isGamepad(event.device, event.source)) return false
        val index = STANDARD[event.keyCode] ?: return false
        val d = deviceOf(event.deviceId, event.device) ?: return true
        val changed = when (event.action) {
            KeyEvent.ACTION_DOWN -> d.held.add(index)
            KeyEvent.ACTION_UP -> d.held.remove(index)
            else -> false
        }
        if (changed) onChange()
        return true
    }

    /** Handles sticks, triggers and hats; true when it was a controller's. */
    fun onMotion(event: MotionEvent): Boolean {
        if (event.action != MotionEvent.ACTION_MOVE) return false
        if (event.source and InputDevice.SOURCE_JOYSTICK != InputDevice.SOURCE_JOYSTICK) return false
        val d = deviceOf(event.deviceId, event.device) ?: return true
        val before = listOf(d.lx, d.ly, d.rx, d.ry, d.hatX, d.hatY, d.held.size.toDouble())
        d.lx = event.getAxisValue(MotionEvent.AXIS_X).toDouble()
        d.ly = event.getAxisValue(MotionEvent.AXIS_Y).toDouble()
        d.rx = event.getAxisValue(MotionEvent.AXIS_Z).toDouble()
        d.ry = event.getAxisValue(MotionEvent.AXIS_RZ).toDouble()
        d.hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X).toDouble()
        d.hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y).toDouble()
        // Analog triggers on controllers that do not also send L2/R2 keys.
        trigger(d, StandardGamepad.L2, maxOf(event.getAxisValue(MotionEvent.AXIS_LTRIGGER), event.getAxisValue(MotionEvent.AXIS_BRAKE)))
        trigger(d, StandardGamepad.R2, maxOf(event.getAxisValue(MotionEvent.AXIS_RTRIGGER), event.getAxisValue(MotionEvent.AXIS_GAS)))
        val after = listOf(d.lx, d.ly, d.rx, d.ry, d.hatX, d.hatY, d.held.size.toDouble())
        if (before.zip(after).any { (a, b) -> abs(a - b) > 0.01 }) onChange()
        return true
    }

    private fun trigger(d: Device, index: Int, value: Float) {
        if (value > 0.5f) d.held += index else if (value < 0.3f) d.held -= index
    }

    /** A controller was unplugged: its player is released. */
    fun onDeviceRemoved(deviceId: Int) {
        if (devices.remove(deviceId) != null) onChange()
    }

    fun clear() {
        devices.clear()
    }

    private fun deviceOf(id: Int, device: InputDevice?): Device? {
        devices[id]?.let { return it }
        val used = devices.values.map { it.player }.toSet()
        val player = (0 until MAX_LOCAL_PLAYERS).firstOrNull { it !in used } ?: return null
        val name = device?.name?.take(40)?.ifBlank { null } ?: "Gamepad"
        return Device(player, name).also {
            devices[id] = it
            onChange()
        }
    }

    companion object {
        fun isGamepad(device: InputDevice?, source: Int): Boolean {
            val s = device?.sources ?: source
            return s and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
                s and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK
        }

        /**
         * Android key codes to the standard Gamepad indexes. Android names
         * the bottom face button A and the right one B (Xbox layout), like
         * the standard mapping's 0 and 1.
         */
        val STANDARD: Map<Int, Int> = mapOf(
            KeyEvent.KEYCODE_BUTTON_A to StandardGamepad.FACE_BOTTOM,
            KeyEvent.KEYCODE_BUTTON_B to StandardGamepad.FACE_RIGHT,
            KeyEvent.KEYCODE_BUTTON_X to StandardGamepad.FACE_LEFT,
            KeyEvent.KEYCODE_BUTTON_Y to StandardGamepad.FACE_TOP,
            KeyEvent.KEYCODE_BUTTON_L1 to StandardGamepad.L1,
            KeyEvent.KEYCODE_BUTTON_R1 to StandardGamepad.R1,
            KeyEvent.KEYCODE_BUTTON_L2 to StandardGamepad.L2,
            KeyEvent.KEYCODE_BUTTON_R2 to StandardGamepad.R2,
            KeyEvent.KEYCODE_BUTTON_SELECT to StandardGamepad.SELECT,
            KeyEvent.KEYCODE_BUTTON_START to StandardGamepad.START,
            KeyEvent.KEYCODE_BUTTON_THUMBL to StandardGamepad.L3,
            KeyEvent.KEYCODE_BUTTON_THUMBR to StandardGamepad.R3,
            KeyEvent.KEYCODE_DPAD_UP to StandardGamepad.DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN to StandardGamepad.DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT to StandardGamepad.DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT to StandardGamepad.DPAD_RIGHT,
            KeyEvent.KEYCODE_BUTTON_MODE to StandardGamepad.HOME,
        )
    }
}
