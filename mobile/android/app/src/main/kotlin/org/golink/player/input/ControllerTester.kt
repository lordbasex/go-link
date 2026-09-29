// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.input

import android.content.Context
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The "Test controller" screen's input, with no room and no network: the
 * same controller mapping the room uses (GamepadInput), the buttons held
 * on every controller, and when the latest change happened, so the screen
 * can measure the time to the next frame. Called on the main thread.
 */
class ControllerTester(private val context: Context) {
    private val _buttons = MutableStateFlow(0)
    val buttons: StateFlow<Int> = _buttons.asStateFlow()

    private val _connected = MutableStateFlow<List<ConnectedController>>(emptyList())
    val connected: StateFlow<List<ConnectedController>> = _connected.asStateFlow()

    /** The controller whose input came last (its device id), or -1. */
    private val _lastDevice = MutableStateFlow(-1)
    val lastDevice: StateFlow<Int> = _lastDevice.asStateFlow()

    private var eventMs = 0L
    private var pendingMs = -1L

    private val pads = GamepadInput { update() }

    private fun update() {
        val bits = pads.pads().fold(0) { acc, p -> acc or p.buttons }
        if (bits != _buttons.value) {
            _buttons.value = bits
            pendingMs = eventMs
        }
    }

    fun onKey(event: KeyEvent): Boolean {
        eventMs = event.eventTime
        val handled = pads.onKey(event)
        if (handled) _lastDevice.value = event.deviceId
        return handled
    }

    fun onMotion(event: MotionEvent): Boolean {
        eventMs = event.eventTime
        val handled = pads.onMotion(event)
        if (handled) _lastDevice.value = event.deviceId
        return handled
    }

    /** A touch on the screen's pad changed what is held; eventMs is the touch event's uptime. */
    fun touched(eventMs: Long) {
        pendingMs = if (eventMs > 0) eventMs else SystemClock.uptimeMillis()
    }

    /**
     * The uptime (ms) of the input change the next frame shows, once;
     * -1 when nothing changed since the last frame.
     */
    fun takePending(): Long {
        val p = pendingMs
        pendingMs = -1L
        return p
    }

    fun refresh() {
        _connected.value = Controllers.connected(context)
    }

    fun onDeviceRemoved(id: Int) {
        pads.onDeviceRemoved(id)
        refresh()
    }

    /** The screen opened or closed: nothing is held. */
    fun reset() {
        pads.clear()
        _buttons.value = 0
        pendingMs = -1L
        _lastDevice.value = -1
        refresh()
    }
}
