// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// The room's Sound sheet: which microphone and which output the voice chat
// and the game sound use. The platform lists its live devices (Android's
// AudioDeviceInfo, mapped to AudioDevice); this file builds the options,
// maps a saved choice back to a live device, plans the route and decides
// when a chosen device is gone (then the choice goes back to Automatic).

/** The kinds of audio device the Sound sheet offers. The earpiece is never one of them. */
enum class AudioKind {
    SPEAKER,
    BUILTIN_MIC,
    WIRED,
    BLUETOOTH,
    USB,
    HEARING_AID,
    ;

    /** Part of the phone itself: there is only one of each, so the kind alone identifies it. */
    val builtIn: Boolean get() = this == SPEAKER || this == BUILTIN_MIC
}

/**
 * A connected device. [id] is the platform's id, which changes when the
 * device reconnects; [address] (a Bluetooth address, a USB path) and
 * [name] (the product name) identify it again after that.
 */
data class AudioDevice(val id: Int, val kind: AudioKind, val name: String = "", val address: String = "") {
    val key: String get() = keyOf(kind, name, address)
}

private fun keyOf(kind: AudioKind, name: String, address: String): String =
    if (kind.builtIn) kind.name else "${kind.name}|$address|$name"

/** What the person picked: Automatic, or one device. */
sealed interface AudioChoice {
    data object Automatic : AudioChoice

    data class Device(val kind: AudioKind, val name: String = "", val address: String = "") : AudioChoice {
        val key: String get() = keyOf(kind, name, address)
    }

    companion object {
        fun of(device: AudioDevice): AudioChoice =
            Device(device.kind, if (device.kind.builtIn) "" else device.name, if (device.kind.builtIn) "" else device.address)

        /** The saved form (null for Automatic, which needs nothing saved). */
        fun encode(choice: AudioChoice): String? = when (choice) {
            Automatic -> null
            is Device -> JsonObject(
                mapOf(
                    "kind" to JsonPrimitive(choice.kind.name),
                    "name" to JsonPrimitive(choice.name),
                    "address" to JsonPrimitive(choice.address),
                ),
            ).toString()
        }

        /** Reads a saved choice; anything unreadable is Automatic. */
        fun decode(text: String?): AudioChoice {
            if (text.isNullOrBlank()) return Automatic
            val o = parseObject(text) ?: return Automatic
            val kind = AudioKind.entries.firstOrNull { it.name == o["kind"].str(40) } ?: return Automatic
            return Device(kind, o["name"].str(200), o["address"].str(200))
        }
    }
}

/** One row of the sheet: Automatic ([device] null) or a live device. */
data class AudioOption(val choice: AudioChoice, val device: AudioDevice?)

/** Where to send the sound and which microphone to prefer; null means the automatic route. */
data class AudioPlan(val communication: AudioDevice?, val input: AudioDevice?)

/** A chosen device that disconnected: its choice went back to Automatic. */
data class LostAudioDevice(val input: Boolean, val kind: AudioKind, val name: String)

object AudioChoices {
    /** Automatic, the loudspeaker, then each headset (never the earpiece, never a microphone). */
    fun outputs(devices: List<AudioDevice>): List<AudioOption> =
        options(devices.filter { it.kind != AudioKind.BUILTIN_MIC }, AudioKind.SPEAKER)

    /** Automatic, the phone's microphone, then each headset's microphone. */
    fun inputs(devices: List<AudioDevice>): List<AudioOption> =
        options(devices.filter { it.kind != AudioKind.SPEAKER && it.kind != AudioKind.HEARING_AID }, AudioKind.BUILTIN_MIC)

    private fun options(devices: List<AudioDevice>, builtIn: AudioKind): List<AudioOption> {
        val unique = devices.distinctBy { it.key }
        val first = unique.filter { it.kind == builtIn }
        val rest = unique.filter { it.kind != builtIn }
        return listOf(AudioOption(AudioChoice.Automatic, null)) + (first + rest).map { AudioOption(AudioChoice.of(it), it) }
    }

    /** The live device a choice means, or null (Automatic, or not connected). */
    fun resolve(choice: AudioChoice, devices: List<AudioDevice>): AudioDevice? = when (choice) {
        AudioChoice.Automatic -> null
        is AudioChoice.Device -> devices.firstOrNull { it.key == choice.key }
    }

    /**
     * The route for both choices. A chosen output is the communication
     * device. A chosen headset microphone with an automatic output also
     * makes that headset the communication device, since Android opens a
     * Bluetooth headset's microphone only together with its sound.
     */
    fun plan(output: AudioChoice, input: AudioChoice, outputs: List<AudioDevice>, inputs: List<AudioDevice>): AudioPlan {
        val out = resolve(output, outputs)
        val mic = resolve(input, inputs)
        val communication = out ?: mic?.takeIf { !it.kind.builtIn }?.let { counterpart(it, outputs) }
        return AudioPlan(communication, mic)
    }

    /** The output side of a headset's microphone: the same kind, and the same address when both have one. */
    fun counterpart(mic: AudioDevice, outputs: List<AudioDevice>): AudioDevice? {
        val same = outputs.filter { it.kind == mic.kind }
        return same.firstOrNull { mic.address.isNotEmpty() && it.address == mic.address }
            ?: same.firstOrNull { mic.address.isEmpty() || it.address.isEmpty() }
    }
}

/**
 * The two choices during one room visit. A saved device that is not
 * connected when the room opens waits (the route stays automatic) and is
 * used as soon as it connects; a chosen device that was connected and
 * then disappears goes back to Automatic, and [update] reports it.
 */
class AudioSelection(output: AudioChoice = AudioChoice.Automatic, input: AudioChoice = AudioChoice.Automatic) {
    var output: AudioChoice = output
        private set
    var input: AudioChoice = input
        private set

    private var outputSeen = false
    private var inputSeen = false
    private var outputs: List<AudioDevice> = emptyList()
    private var inputs: List<AudioDevice> = emptyList()

    fun chooseOutput(choice: AudioChoice) {
        output = choice
        outputSeen = AudioChoices.resolve(choice, outputs) != null
    }

    fun chooseInput(choice: AudioChoice) {
        input = choice
        inputSeen = AudioChoices.resolve(choice, inputs) != null
    }

    /** Takes the live devices; returns the chosen devices that just disconnected. */
    fun update(outputs: List<AudioDevice>, inputs: List<AudioDevice>): List<LostAudioDevice> {
        this.outputs = outputs
        this.inputs = inputs
        val lost = ArrayList<LostAudioDevice>(2)
        (output as? AudioChoice.Device)?.let { c ->
            if (AudioChoices.resolve(c, outputs) != null) {
                outputSeen = true
            } else if (outputSeen) {
                lost += LostAudioDevice(input = false, kind = c.kind, name = c.name)
                output = AudioChoice.Automatic
                outputSeen = false
            }
        }
        (input as? AudioChoice.Device)?.let { c ->
            if (AudioChoices.resolve(c, inputs) != null) {
                inputSeen = true
            } else if (inputSeen) {
                lost += LostAudioDevice(input = true, kind = c.kind, name = c.name)
                input = AudioChoice.Automatic
                inputSeen = false
            }
        }
        return lost
    }

    fun plan(): AudioPlan = AudioChoices.plan(output, input, outputs, inputs)

    /** The sheet's rows. */
    fun outputOptions(): List<AudioOption> = AudioChoices.outputs(outputs)

    fun inputOptions(): List<AudioOption> = AudioChoices.inputs(inputs)

    /** The row to mark: the choice when its device is here, Automatic otherwise. */
    fun shownOutput(): AudioChoice = output.takeIf { AudioChoices.resolve(it, outputs) != null } ?: AudioChoice.Automatic

    fun shownInput(): AudioChoice = input.takeIf { AudioChoices.resolve(it, inputs) != null } ?: AudioChoice.Automatic
}
