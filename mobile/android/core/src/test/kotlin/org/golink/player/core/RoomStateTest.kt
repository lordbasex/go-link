// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RoomStateTest {
    @Test
    fun parsesARoomState() {
        val m = parseObject(
            """{"type":"room_state","max_players":2,"voice":true,"chat":false,
            "info":{"title":"Friday","game":"Some Game","host":"Fede","art":"QUJD"},
            "seats":[{"name":"Ana","local_player":0,"you":true},null,{"name":"extra"}],
            "queue":[{"position":1,"name":"Guest 9F3A","you":false}],
            "spectators":[{"name":"Bo","you":false}],
            "you":{"name":"Ana","ports":[1],"queue_positions":[],"spectator":false,
              "swap_offers":[{"from":2,"to":1,"name":"Bo"},{"from":1,"to":1},{"from":3,"to":1}],"swap_asked":[]},
            "pausable":true,"paused":true,"paused_by":"Ana",
            "controls":{"players":2,"buttons":9,"control":"joy4way"},"recording":true}""",
        )!!
        val s = RoomMessages.parseRoomState(m)!!
        assertEquals(2, s.maxPlayers)
        assertFalse(s.chat)
        assertEquals(listOf(SeatView(1, "Ana", 0, true), null), s.seats)
        assertEquals(RoomInfoView("Friday", "Some Game", "Fede", "QUJD"), s.info)
        assertEquals(listOf(SwapView(2, 1, "Bo")), s.you.swapOffers)
        assertEquals(GameControls(2, 6, "joy4way"), s.controls)
        assertEquals(Me.Player(listOf(1)), s.me)
        assertTrue(s.paused && s.pausable && s.recording)
        assertEquals("9F3A", RoomMessages.guestId(s.queue[0].name))
        assertNull(RoomMessages.guestId("Ana"))
    }

    @Test
    fun defaultsForOlderDevices() {
        val s = RoomMessages.parseRoomState(parseObject("""{"type":"room_state","you":{"queue_positions":[3,2]}}""")!!)!!
        assertEquals(1, s.maxPlayers)
        assertTrue(s.voice)
        assertTrue(s.chat)
        assertEquals(GameControls.DEFAULT, s.controls)
        assertEquals(Me.Queue(2), s.me)
        assertNull(RoomMessages.parseRoomState(parseObject("""{"type":"chat"}""")!!))
    }

    @Test
    fun chatLines() {
        val user = RoomMessages.parseChat(parseObject("""{"type":"chat","name":"Ana","port":1,"role":"player","text":"hi","ts":5}""")!!)
        assertEquals(ChatLine.User("Ana", 1, "player", "hi", 5.0), user)
        val sys = RoomMessages.parseChat(
            parseObject("""{"type":"chat","system":"Ana took seat P2","event":"took_seat","args":{"name":"Ana","port":2},"ts":1}""")!!,
        )
        assertEquals(ChatLine.System("Ana took seat P2", 1.0, ChatEvent.TOOK_SEAT, ChatArgs("Ana", 2, "", 0)), sys)
        val unknown = RoomMessages.parseChat(parseObject("""{"type":"chat","system":"new thing","event":"future_event"}""")!!)
        assertEquals(ChatLine.System("new thing", 0.0), unknown)
        assertNull(RoomMessages.parseChat(parseObject("""{"type":"chat","text":"no name"}""")!!))
    }

    @Test
    fun typingAndStats() {
        val who = RoomMessages.parseTyping(parseObject("""{"type":"typing","names":[{"name":"Bo","port":2},{"name":""}]}""")!!)
        assertEquals(listOf(TypingView("Bo", 2)), who)
        val st = RoomMessages.parseStreamStats(parseObject("""{"type":"stream_stats","fps":59.9,"aspect":1.3333}""")!!)
        assertEquals(StreamStatsView(59.9, 1.3333), st)
        assertEquals(StreamStatsView(null, null), RoomMessages.parseStreamStats(parseObject("""{"type":"stream_stats","aspect":9}""")!!))
    }

    @Test
    fun pauseRequestFields() {
        val s = RoomMessages.parseRoomState(
            parseObject("""{"type":"room_state","host_online":false,"you":{"pause_asked":{"expires_at":"2026-09-29T10:00:30Z"}}}""")!!,
        )!!
        assertFalse(s.hostOnline)
        assertEquals(PauseAsk("2026-09-29T10:00:30Z"), s.you.pauseAsked)
        val none = RoomMessages.parseRoomState(parseObject("""{"type":"room_state","host_online":true,"you":{"pause_asked":null}}""")!!)!!
        assertTrue(none.hostOnline)
        assertNull(none.you.pauseAsked)
        // Older devices send neither: the host counts as online.
        assertTrue(RoomMessages.parseRoomState(parseObject("""{"type":"room_state"}""")!!)!!.hostOnline)
        val declined = RoomMessages.parseChat(parseObject("""{"type":"chat","system":"The host declined","event":"pause_declined","ts":3}""")!!)
        assertEquals(ChatLine.System("The host declined", 3.0, ChatEvent.PAUSE_DECLINED), declined)
    }
}
