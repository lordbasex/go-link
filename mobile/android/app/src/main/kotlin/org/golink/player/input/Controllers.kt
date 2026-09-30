// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.input

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.usb.UsbManager
import android.os.Build
import android.view.InputDevice

/** How a controller is connected, as far as Android tells (best effort). */
enum class ControllerKind { BLUETOOTH, USB, UNKNOWN }

/** A physical controller the system lists, used or not yet. */
data class ConnectedController(val id: Int, val name: String, val kind: ControllerKind)

/**
 * The physical controllers connected right now (Bluetooth, USB or OTG),
 * read from the system's input devices, so the app knows about a
 * controller before its first button press. Virtual devices (the
 * emulator's, the on-screen keyboard's) are left out.
 */
object Controllers {
    fun connected(context: Context): List<ConnectedController> {
        val devices = InputDevice.getDeviceIds().toList().mapNotNull { InputDevice.getDevice(it) }.filter { isController(it) }
        if (devices.isEmpty()) return emptyList()
        val paired = pairedNames(context)
        val usb = usbIds(context)
        return devices.map { d -> ConnectedController(d.id, d.name?.take(40)?.ifBlank { null } ?: "Gamepad", kindOf(d, usb, paired)) }
    }

    fun isController(d: InputDevice): Boolean {
        if (d.isVirtual) return false
        val s = d.sources
        val pad = s and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
            s and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK
        if (!pad) return false
        // Built-in keys (volume, the emulator's D-pad) are not a controller.
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || d.isExternal
    }

    /**
     * Android does not say how an input device is connected, so this only
     * names a link it can check: USB when a USB device with the same
     * vendor and product id is attached to the phone (a cable that only
     * charges a Bluetooth controller does not make it one), Bluetooth when
     * a paired Bluetooth device has the same name (needs the nearby
     * devices permission on Android 12+), unknown otherwise: the screen
     * then shows just the controller's name instead of guessing.
     */
    fun kindOf(d: InputDevice, usbIds: Set<Pair<Int, Int>>, bluetoothNames: Set<String>): ControllerKind = when {
        d.vendorId != 0 && (d.vendorId to d.productId) in usbIds -> ControllerKind.USB
        d.name != null && d.name in bluetoothNames -> ControllerKind.BLUETOOTH
        else -> ControllerKind.UNKNOWN
    }

    /** Vendor and product ids of the USB devices attached to the phone (no permission needed to list them). */
    private fun usbIds(context: Context): Set<Pair<Int, Int>> = runCatching {
        context.getSystemService(UsbManager::class.java)?.deviceList?.values?.map { it.vendorId to it.productId }?.toSet()
    }.getOrNull() ?: emptySet()

    @SuppressLint("MissingPermission") // checked just before
    private fun pairedNames(context: Context): Set<String> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
        ) {
            return emptySet()
        }
        return runCatching {
            context.getSystemService(BluetoothManager::class.java)?.adapter?.bondedDevices?.mapNotNull { it.name }?.toSet()
        }.getOrNull() ?: emptySet()
    }
}
