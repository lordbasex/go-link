// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation
import GameController
import GoLinkCore

/**
 * MFi, Xbox, PlayStation and Switch Pro controllers through the
 * GameController framework, mapped like the browser's "standard" Gamepad
 * layout (by position: A is the bottom face button, B the right one), so
 * they play exactly as on the website and in the Android app. Each
 * controller is a local player in the order it was first used (the first
 * one shares player 0 with the on-screen gamepad), up to four.
 */
@MainActor
final class GamepadInput: ObservableObject {
    struct Controller: Equatable, Identifiable {
        let id: ObjectIdentifier
        let player: Int
        let name: String
    }

    /** A controller the system has connected, used or not yet. */
    struct Connected: Equatable, Identifiable {
        enum Link: Equatable { case bluetooth, wired }

        let id: ObjectIdentifier
        let name: String
        let link: Link
    }

    private final class Device {
        let player: Int
        let name: String
        var held = Set<Int>()
        var lx = 0.0, ly = 0.0, rx = 0.0, ry = 0.0

        init(player: Int, name: String) {
            self.player = player
            self.name = name
        }
    }

    @Published private(set) var controllers: [Controller] = []
    /** Every connected controller, even before its first button press (for the see-through pad and the test screen). */
    @Published private(set) var connected: [Connected] = []
    private var devices: [ObjectIdentifier: Device] = [:]
    private var order: [ObjectIdentifier] = []
    private var observers: [NSObjectProtocol] = []
    private let onChange: () -> Void

    init(onChange: @escaping () -> Void) {
        self.onChange = onChange
    }

    func start() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] n in
            MainActor.assumeIsolated {
                if let c = n.object as? GCController { self?.watch(c) }
                self?.refreshConnected()
            }
        })
        observers.append(center.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] n in
            MainActor.assumeIsolated {
                if let c = n.object as? GCController { self?.remove(c) }
                self?.refreshConnected()
            }
        })
        GCController.controllers().forEach(watch)
        refreshConnected()
        GCController.startWirelessControllerDiscovery {}
    }

    func stop() {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        GCController.stopWirelessControllerDiscovery()
        for c in GCController.controllers() { c.extendedGamepad?.valueChangedHandler = nil }
        devices = [:]
        order = []
        controllers = []
        connected = []
    }

    /** All the buttons held on every controller together, for drawing them (not for sending). */
    func heldBits() -> Int { pads().reduce(0) { $0 | $1.buttons } }

    private func refreshConnected() {
        connected = GCController.controllers().filter { $0.extendedGamepad != nil }.map { c in
            let name = String((c.vendorName ?? c.productCategory).prefix(40))
            // iOS does not say which radio a controller uses. A cable often
            // only charges it (a Switch Pro on USB-C keeps talking over
            // Bluetooth), so only a controller the system reports as
            // attached to the device (a clip-on or a wired one) is wired.
            return Connected(id: ObjectIdentifier(c), name: name.isEmpty ? "Gamepad" : name, link: c.isAttachedToDevice ? .wired : .bluetooth)
        }
    }

    /** The pad of each local player (index 0...3) from the controllers. */
    func pads() -> [Pad] {
        (0..<maxLocalPlayers).map { player in
            var buttons = 0
            var axes = [0, 0, 0, 0]
            for d in devices.values where d.player == player {
                let pad = StandardGamepad.pad(held: d.held, lx: d.lx, ly: d.ly, rx: d.rx, ry: d.ry)
                buttons |= pad.buttons
                for (i, a) in pad.axes.enumerated() where a != 0 { axes[i] = a }
            }
            return Pad(buttons: buttons, axes: axes)
        }
    }

    private func watch(_ c: GCController) {
        guard let g = c.extendedGamepad else { return }
        g.valueChangedHandler = { [weak self, weak c] gamepad, _ in
            MainActor.assumeIsolated {
                guard let self, let c else { return }
                self.read(c, gamepad)
            }
        }
    }

    private func remove(_ c: GCController) {
        let id = ObjectIdentifier(c)
        if devices.removeValue(forKey: id) != nil {
            order.removeAll { $0 == id }
            publish()
            onChange()
        }
    }

    private func read(_ c: GCController, _ g: GCExtendedGamepad) {
        let id = ObjectIdentifier(c)
        let d: Device
        if let existing = devices[id] {
            d = existing
        } else {
            let used = Set(devices.values.map(\.player))
            guard let player = (0..<maxLocalPlayers).first(where: { !used.contains($0) }) else { return }
            let name = String((c.vendorName ?? "").prefix(40))
            d = Device(player: player, name: name.isEmpty ? "Gamepad" : name)
            devices[id] = d
            order.append(id)
            publish()
        }
        var held = Set<Int>()
        func press(_ b: GCControllerButtonInput?, _ index: Int) {
            if b?.isPressed == true { held.insert(index) }
        }
        press(g.buttonA, StandardGamepad.faceBottom)
        press(g.buttonB, StandardGamepad.faceRight)
        press(g.buttonX, StandardGamepad.faceLeft)
        press(g.buttonY, StandardGamepad.faceTop)
        press(g.leftShoulder, StandardGamepad.l1)
        press(g.rightShoulder, StandardGamepad.r1)
        press(g.leftTrigger, StandardGamepad.l2)
        press(g.rightTrigger, StandardGamepad.r2)
        press(g.buttonOptions, StandardGamepad.select)
        press(g.buttonMenu, StandardGamepad.start)
        press(g.leftThumbstickButton, StandardGamepad.l3)
        press(g.rightThumbstickButton, StandardGamepad.r3)
        press(g.dpad.up, StandardGamepad.dpadUp)
        press(g.dpad.down, StandardGamepad.dpadDown)
        press(g.dpad.left, StandardGamepad.dpadLeft)
        press(g.dpad.right, StandardGamepad.dpadRight)
        press(g.buttonHome, StandardGamepad.home)
        d.held = held
        // GameController's y points up; the standard layout's points down.
        d.lx = Double(g.leftThumbstick.xAxis.value)
        d.ly = -Double(g.leftThumbstick.yAxis.value)
        d.rx = Double(g.rightThumbstick.xAxis.value)
        d.ry = -Double(g.rightThumbstick.yAxis.value)
        onChange()
    }

    private func publish() {
        controllers = order.compactMap { id in devices[id].map { Controller(id: id, player: $0.player, name: $0.name) } }
    }
}
