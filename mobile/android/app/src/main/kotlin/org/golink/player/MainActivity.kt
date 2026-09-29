// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player

import android.content.Intent
import android.hardware.input.InputManager
import android.os.Bundle
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.golink.player.core.Invites
import org.golink.player.ui.GoLinkTheme
import org.golink.player.ui.HeadphonesScreen
import org.golink.player.ui.HomeScreen
import org.golink.player.ui.JoinScreen
import org.golink.player.ui.Perms
import org.golink.player.ui.RoomScreen
import org.golink.player.ui.ScanScreen
import org.golink.player.ui.SettingsScreen
import org.golink.player.ui.Tokens

class MainActivity : ComponentActivity() {
    private val vm: PlayerViewModel by viewModels()

    private val inputDevices = object : InputManager.InputDeviceListener {
        override fun onInputDeviceAdded(deviceId: Int) = Unit

        override fun onInputDeviceChanged(deviceId: Int) = Unit

        override fun onInputDeviceRemoved(deviceId: Int) {
            vm.session?.gamepads?.onDeviceRemoved(deviceId)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handleLink(intent)
        getSystemService(InputManager::class.java).registerInputDeviceListener(inputDevices, null)
        setContent {
            GoLinkTheme {
                // Test tags show up as resource ids for UiAutomator (the
                // Android end-to-end test finds the controls by them).
                @OptIn(ExperimentalComposeUiApi::class)
                Box(Modifier.fillMaxSize().background(Tokens.bg).semantics { testTagsAsResourceId = true }) { App(vm) }
            }
        }
    }

    override fun onDestroy() {
        getSystemService(InputManager::class.java).unregisterInputDeviceListener(inputDevices)
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleLink(intent)
    }

    /**
     * An App Link (https://go-link.org/g/<invite>) goes straight to the PIN
     * form for that invitation. Only the invitation is read from the link:
     * never a PIN or a signaling server.
     */
    private fun handleLink(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val uri = intent.data ?: return
        val target = Invites.parseAppLink(uri.scheme, uri.host, uri.path) ?: return
        vm.openInvite(target)
    }

    // Controllers drive the game while a room is open.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val session = vm.session
        if (session != null && vm.screen.value == Screen.Room && session.gamepads.onKey(event)) return true
        return super.dispatchKeyEvent(event)
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        val session = vm.session
        if (session != null && vm.screen.value == Screen.Room && session.gamepads.onMotion(event)) return true
        return super.dispatchGenericMotionEvent(event)
    }

    /** A room is a console: full screen, screen always on. */
    fun setConsoleMode(on: Boolean) {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        if (on) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false
    }
}

@Composable
private fun App(vm: PlayerViewModel) {
    val screen by vm.screen.collectAsState()
    val signal by vm.signal.collectAsState()
    val activity = androidx.compose.ui.platform.LocalContext.current as MainActivity
    LaunchedEffect(screen) { activity.setConsoleMode(screen == Screen.Room) }
    if (screen != Screen.Home) {
        BackHandler {
            if (screen == Screen.Room) vm.leaveRoom() else vm.go(Screen.Home)
        }
    }
    when (val s = screen) {
        Screen.Home -> HomeScreen(
            signal = signal,
            onScan = { vm.go(Screen.Scan) },
            onType = { vm.go(Screen.Join(null)) },
            onInvite = { vm.go(Screen.Join(it)) },
            onSettings = { vm.go(Screen.Settings) },
            onOfficialServer = { vm.setSignal(null) },
        )
        Screen.Scan -> ScanScreen(
            prefs = vm.prefs,
            onFound = { vm.go(Screen.Join(it)) },
            onType = { vm.go(Screen.Join(null)) },
            onBack = { vm.go(Screen.Home) },
        )
        is Screen.Join -> JoinScreen(
            fixedTarget = s.target,
            termsAccepted = vm.termsAccepted(),
            onJoin = { target, pin ->
                val bt = Perms.BLUETOOTH
                val ask = bt != null && !Perms.granted(activity, bt) && !vm.prefs.asked(bt)
                vm.join(target, pin, askHeadphones = ask)
            },
            onBack = { vm.go(Screen.Home) },
        )
        is Screen.Headphones -> HeadphonesScreen(vm.prefs) { vm.enterRoom(s.target, s.pin) }
        Screen.Room -> {
            val session = vm.session
            if (session == null) {
                LaunchedEffect(Unit) { vm.go(Screen.Home) }
            } else {
                // A permission granted while in the room changes the route.
                LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { session.reroute() }
                RoomScreen(session, vm.prefs, onLeave = { vm.leaveRoom() })
            }
        }
        Screen.Settings -> SettingsScreen(
            name = vm.prefs.playerName,
            signal = signal,
            onName = { vm.setName(it) },
            onSignal = { vm.setSignal(it) },
            onBack = { vm.go(Screen.Home) },
        )
    }
}
