// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class TermsTest {
    // The app asks for the same terms version as the website.
    @Test
    fun versionMatchesTheWebsite() {
        val legal = File("../../../frontend/apps/web/src/legal.ts")
        if (!legal.isFile) return // the app built outside the go-link repository
        val version = Regex("TERMS_VERSION = \"([^\"]+)\"").find(legal.readText())?.groupValues?.get(1)
        assertEquals(version, Terms.VERSION)
    }

    @Test
    fun acceptance() {
        val store = MemoryStore()
        assertFalse(Terms.accepted(store))
        Terms.accept(store, "2026-09-28T00:00:00Z")
        assertTrue(Terms.accepted(store))
        store.set(Terms.STORE_KEY, """{"version":"2020-01-01"}""")
        assertFalse(Terms.accepted(store))
    }

    @Test
    fun roomPassesKeepTheNewest() {
        val passes = RoomPasses(MemoryStore())
        for (i in 1..25) passes.save("room$i", "token$i")
        assertEquals("", passes.get("room1"))
        assertEquals("token25", passes.get("room25"))
        passes.save("room6", "again")
        passes.forget("room25")
        assertEquals("", passes.get("room25"))
        assertEquals("again", passes.get("room6"))
    }
}

class MemoryStore : KeyValueStore {
    val map = HashMap<String, String>()

    override fun get(key: String): String? = map[key]

    override fun set(key: String, value: String?) {
        if (value == null) map.remove(key) else map[key] = value
    }
}
