// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player

import kotlinx.coroutines.CoroutineScope

/**
 * Release builds: no diagnostics at all. The debug build's probe
 * (src/debug) logs the room and WebRTC counters for the end-to-end test.
 */
object E2eProbe {
    @Suppress("UNUSED_PARAMETER")
    fun attach(session: RoomSession, scope: CoroutineScope): () -> Unit = {}
}
