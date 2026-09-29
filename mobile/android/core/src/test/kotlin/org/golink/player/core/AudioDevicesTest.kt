// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioDevicesTest {
    private val speaker = AudioDevice(1, AudioKind.SPEAKER, "Pixel 8")
    private val phoneMic = AudioDevice(2, AudioKind.BUILTIN_MIC, "Pixel 8")
    private val backMic = AudioDevice(3, AudioKind.BUILTIN_MIC, "Pixel 8", "back")
    private val btOut = AudioDevice(10, AudioKind.BLUETOOTH, "Buds", "AA:BB")
    private val btIn = AudioDevice(11, AudioKind.BLUETOOTH, "Buds", "AA:BB")
    private val wiredOut = AudioDevice(20, AudioKind.WIRED, "")
    private val wiredIn = AudioDevice(21, AudioKind.WIRED, "")

    @Test
    fun outputsAreAutomaticSpeakerThenHeadsets() {
        val list = AudioChoices.outputs(listOf(btOut, speaker, wiredOut, phoneMic))
        assertEquals(listOf(null, speaker, btOut, wiredOut), list.map { it.device })
        assertEquals(AudioChoice.Automatic, list[0].choice)
    }

    @Test
    fun inputsHaveOnePhoneMicrophone() {
        val list = AudioChoices.inputs(listOf(btIn, phoneMic, backMic, speaker))
        assertEquals(listOf(null, phoneMic, btIn), list.map { it.device })
    }

    @Test
    fun theSameDeviceTwiceIsOneRow() {
        val twin = btOut.copy(id = 12)
        assertEquals(3, AudioChoices.outputs(listOf(speaker, btOut, twin)).size)
    }

    @Test
    fun aSavedChoiceFindsTheDeviceAfterItReconnects() {
        val saved = AudioChoice.decode(AudioChoice.encode(AudioChoice.of(btOut)))
        val back = btOut.copy(id = 99)
        assertEquals(back, AudioChoices.resolve(saved, listOf(speaker, back)))
        assertNull(AudioChoices.resolve(saved, listOf(speaker)))
        assertNull(AudioChoices.resolve(AudioChoice.Automatic, listOf(speaker)))
    }

    @Test
    fun builtInChoicesDoNotDependOnTheModelName() {
        val saved = AudioChoice.decode(AudioChoice.encode(AudioChoice.of(speaker)))
        assertEquals(5, AudioChoices.resolve(saved, listOf(AudioDevice(5, AudioKind.SPEAKER, "Other")))?.id)
    }

    @Test
    fun encodingRoundTripsAndBadTextIsAutomatic() {
        assertNull(AudioChoice.encode(AudioChoice.Automatic))
        val c = AudioChoice.Device(AudioKind.USB, "Cam \"Pro\" | mic", "card=1;device=0")
        assertEquals(c, AudioChoice.decode(AudioChoice.encode(c)))
        assertEquals(AudioChoice.Automatic, AudioChoice.decode(null))
        assertEquals(AudioChoice.Automatic, AudioChoice.decode("not json"))
        assertEquals(AudioChoice.Automatic, AudioChoice.decode("""{"kind":"EARPIECE"}"""))
        assertEquals(AudioChoice.Automatic, AudioChoice.decode("""{"kind":7}"""))
    }

    @Test
    fun planUsesTheChosenOutput() {
        val plan = AudioChoices.plan(AudioChoice.of(speaker), AudioChoice.Automatic, listOf(speaker, btOut), listOf(phoneMic, btIn))
        assertEquals(AudioPlan(speaker, null), plan)
    }

    @Test
    fun aHeadsetMicrophoneBringsItsHeadsetWhenTheOutputIsAutomatic() {
        val plan = AudioChoices.plan(AudioChoice.Automatic, AudioChoice.of(btIn), listOf(speaker, wiredOut, btOut), listOf(phoneMic, wiredIn, btIn))
        assertEquals(AudioPlan(btOut, btIn), plan)
        val wired = AudioChoices.plan(AudioChoice.Automatic, AudioChoice.of(wiredIn), listOf(speaker, wiredOut, btOut), listOf(phoneMic, wiredIn, btIn))
        assertEquals(AudioPlan(wiredOut, wiredIn), wired)
    }

    @Test
    fun thePhoneMicrophoneKeepsTheAutomaticOutput() {
        val plan = AudioChoices.plan(AudioChoice.Automatic, AudioChoice.of(phoneMic), listOf(speaker, btOut), listOf(phoneMic, btIn))
        assertEquals(AudioPlan(null, phoneMic), plan)
    }

    @Test
    fun counterpartPrefersTheSameAddress() {
        val other = AudioDevice(30, AudioKind.BLUETOOTH, "Car", "CC:DD")
        assertEquals(btOut, AudioChoices.counterpart(btIn, listOf(other, btOut)))
        assertNull(AudioChoices.counterpart(btIn, listOf(other)))
        assertNull(AudioChoices.counterpart(btIn, listOf(speaker)))
    }

    @Test
    fun aChosenDeviceThatDisconnectsGoesBackToAutomatic() {
        val s = AudioSelection()
        s.update(listOf(speaker, btOut), listOf(phoneMic, btIn))
        s.chooseOutput(AudioChoice.of(btOut))
        s.chooseInput(AudioChoice.of(btIn))
        assertEquals(AudioPlan(btOut, btIn), s.plan())
        val lost = s.update(listOf(speaker), listOf(phoneMic))
        assertEquals(
            listOf(LostAudioDevice(false, AudioKind.BLUETOOTH, "Buds"), LostAudioDevice(true, AudioKind.BLUETOOTH, "Buds")),
            lost,
        )
        assertEquals(AudioChoice.Automatic, s.output)
        assertEquals(AudioChoice.Automatic, s.input)
        assertEquals(AudioPlan(null, null), s.plan())
        // Reported once.
        assertTrue(s.update(listOf(speaker), listOf(phoneMic)).isEmpty())
    }

    @Test
    fun aSavedDeviceMissingAtTheStartWaitsForIt() {
        val s = AudioSelection(output = AudioChoice.of(btOut))
        assertTrue(s.update(listOf(speaker), listOf(phoneMic)).isEmpty())
        assertEquals(AudioChoice.of(btOut), s.output)
        assertEquals(AudioChoice.Automatic, s.shownOutput())
        assertEquals(AudioPlan(null, null), s.plan())
        // It connects: used at once; then it leaves: Automatic, reported.
        s.update(listOf(speaker, btOut), listOf(phoneMic))
        assertEquals(AudioChoice.of(btOut), s.shownOutput())
        assertEquals(btOut, s.plan().communication)
        assertEquals(1, s.update(listOf(speaker), listOf(phoneMic)).size)
        assertEquals(AudioChoice.Automatic, s.output)
    }

    @Test
    fun choosingAMissingDeviceIsNotReportedAsLost() {
        val s = AudioSelection()
        s.update(listOf(speaker), listOf(phoneMic))
        s.chooseOutput(AudioChoice.of(btOut))
        assertTrue(s.update(listOf(speaker), listOf(phoneMic)).isEmpty())
    }

    @Test
    fun optionsFromTheSelection() {
        val s = AudioSelection()
        s.update(listOf(speaker, btOut), listOf(phoneMic, btIn))
        assertEquals(3, s.outputOptions().size)
        assertEquals(3, s.inputOptions().size)
        assertEquals(AudioChoice.Automatic, s.shownInput())
    }
}
