// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** stream_stats "video" and the renderer's working size (the website's video.test.ts and renderer.test.ts). */
class StreamVideoTest {
    private val stats = """"type":"stream_stats","fps":59.9,"width":768,"height":448,"aspect":1.3333"""

    private fun parse(video: String) = StreamVideo.parse(parseObject("{$stats,\"video\":$video}")!!)

    @Test
    fun readsA2xPictureWithTheGamesSizeAndQuality() {
        val v = parse("""{"scale":2,"width":384,"height":224,"quality":"high"}""")
        assertEquals(StreamVideo(2, 384, 224, VideoQuality.HIGH, null), v)
        assertEquals(PixelSize(384, 224), v?.native)
        val saver = parse("""{"scale":1,"width":384,"height":224,"quality":"saver","fallback":"cpu"}""")
        assertEquals(StreamVideo(1, 384, 224, VideoQuality.SAVER, "cpu"), saver)
        assertNull(saver?.native)
        // The whole message: stream_stats keeps it next to fps and aspect.
        val st = RoomMessages.parseStreamStats(parseObject("""{$stats,"video":{"scale":2,"width":384,"height":224,"quality":"high"}}""")!!)
        assertEquals(v, st?.video)
    }

    @Test
    fun ignoresOlderDevicesAndBrokenValues() {
        assertNull(StreamVideo.parse(parseObject("{$stats}")!!))
        assertNull(RoomMessages.parseStreamStats(parseObject("{$stats}")!!)?.video)
        assertNull(parse("""{"scale":3,"width":384,"height":224}"""))
        assertNull(parse("""{"scale":2,"width":0,"height":224}"""))
        assertNull(parse("""{"scale":2,"width":1e9,"height":224}"""))
        assertNull(parse("""{"scale":2,"width":384.5,"height":224}"""))
        assertNull(parse("""{"scale":"2","width":384,"height":224}"""))
        assertNull(parse("\"2x\""))
        assertNull(StreamVideo.parse(parseObject("""{"type":"room_state","video":{"scale":2,"width":384,"height":224}}""")!!))
        assertEquals(StreamVideo(2, 384, 224), parse("""{"scale":2,"width":384,"height":224,"quality":"4k","fallback":"gpu"}"""))
    }

    @Test
    fun workingSizeAveragesOnlyAnExact2xFrame() {
        val native = PixelSize(384, 224)
        assertEquals(WorkingSize(384, 224, true), workingSize(768, 448, native))
        // A frame of the old size while the quality changes, or scale 1.
        assertEquals(WorkingSize(384, 224, false), workingSize(384, 224, native))
        assertEquals(WorkingSize(768, 450, false), workingSize(768, 450, native))
        assertEquals(WorkingSize(768, 448, false), workingSize(768, 448, null))
        assertEquals(WorkingSize(640, 480, false), workingSize(640, 480, PixelSize(0, 0)))
    }
}
