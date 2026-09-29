// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import SwiftUI

enum DrawerTab: Hashable { case chat, players, you }

/**
 * The room's side panel with three tabs, as in the approved design:
 * Chat (typing indicator, unread badge), Players (seats, swap, move,
 * silence, watch or queue) and You (name, Volume and voice, How to play,
 * Leave). It slides in from the right in landscape and from the bottom in
 * portrait.
 */
struct RoomDrawer: View {
    @ObservedObject var session: RoomSession
    @Binding var tab: DrawerTab
    let landscape: Bool
    let unread: Int
    let onSound: () -> Void
    let onHelp: () -> Void
    let onLeave: () -> Void
    let onClose: () -> Void
    @StateObject private var keyboard = KeyboardHeight()

    var body: some View {
        GeometryReader { g in
            let full = g.size.height + g.safeAreaInsets.bottom
            let free = max(200, full - keyboard.height)
            ZStack(alignment: landscape ? .trailing : .bottom) {
                Color.black.opacity(0.35).ignoresSafeArea().onTapGesture(perform: onClose)
                panel
                    .frame(width: landscape ? min(392, g.size.width * 0.5) : g.size.width,
                           height: landscape ? min(g.size.height, free) : min(g.size.height * 0.72, free - 60))
                    .background(Tokens.surface)
                    .overlay(alignment: landscape ? .leading : .top) {
                        Rectangle().fill(Tokens.borderStrong).frame(width: landscape ? 1 : nil, height: landscape ? nil : 1)
                    }
                    .padding(.bottom, keyboard.height > 0 ? max(0, keyboard.height - g.safeAreaInsets.bottom) : 0)
                    .frame(maxHeight: .infinity, alignment: landscape && keyboard.height == 0 ? .center : .bottom)
            }
            .animation(.easeOut(duration: 0.2), value: keyboard.height)
        }
        .ignoresSafeArea(.keyboard)
    }

    private var panel: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                tabButton(.chat, L("room_chat"), badge: unread, tag: "drawer-chat")
                tabButton(.players, L("room_players"), tag: "drawer-players")
                tabButton(.you, L("drawer_you"), tag: "drawer-you")
                Spacer()
                SwiftUI.Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 15, weight: .semibold))
                        .frame(width: 36, height: 36)
                        .overlay(Circle().stroke(Tokens.borderStrong, lineWidth: 1))
                        .frame(width: Tokens.control, height: Tokens.control)
                }
                .foregroundStyle(Tokens.text)
                .accessibilityLabel(L("drawer_close"))
                .accessibilityIdentifier("drawer-close")
            }
            .padding(.leading, 10).padding(.trailing, 8).padding(.top, 8)
            Rectangle().fill(Tokens.border).frame(height: 1)
            switch tab {
            case .chat: ChatPanel(session: session).padding(.horizontal, 12)
            case .players: PlayersPanel(session: session)
            case .you: YouPanel(session: session, onSound: onSound, onHelp: onHelp, onLeave: onLeave)
            }
        }
    }

    private func tabButton(_ t: DrawerTab, _ label: String, badge: Int = 0, tag: String) -> some View {
        SwiftUI.Button { tab = t } label: {
            HStack(spacing: 6) {
                Text(label).font(.system(size: 15, weight: .semibold))
                if badge > 0 {
                    Text("\(min(badge, 99))").font(.system(size: 11, weight: .bold)).foregroundStyle(Tokens.onAccent)
                        .frame(minWidth: 18, minHeight: 18).background(Capsule().fill(Tokens.accent))
                }
            }
            .foregroundStyle(tab == t ? Tokens.text : Tokens.muted)
            .padding(.horizontal, 12)
            .frame(height: Tokens.control)
            .overlay(alignment: .bottom) { Rectangle().fill(tab == t ? Tokens.accent : .clear).frame(height: 2) }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(tab == t ? .isSelected : [])
        .accessibilityIdentifier(tag)
    }
}

/** The room chat, with who is typing. */
struct ChatPanel: View {
    @ObservedObject var session: RoomSession
    @State private var text = ""
    @State private var typingSent: Date?

    var body: some View {
        let ui = session.ui
        VStack(spacing: 0) {
            if ui.room?.chat == false {
                Notice(text: L("room_chat_off")).padding(.vertical, 12)
                Spacer()
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(Array(ui.chat.enumerated()), id: \.offset) { i, line in
                                ChatLineView(line: line, myName: ui.room?.you.name).id(i)
                            }
                        }
                        .padding(.vertical, 12)
                    }
                    .onChange(of: ui.chat.count) { _, n in
                        withAnimation { proxy.scrollTo(n - 1, anchor: .bottom) }
                    }
                    .onAppear { proxy.scrollTo(ui.chat.count - 1, anchor: .bottom) }
                }
                if !ui.typing.isEmpty {
                    Text(L("room_typing", ui.typing.map { localName($0.name) }.joined(separator: ", ")))
                        .font(.caption).italic().foregroundStyle(Tokens.faint)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 4)
                        .accessibilityIdentifier("chat-typing")
                }
                HStack(spacing: 8) {
                    TextField("", text: $text, prompt: Text(L("chat_placeholder")).foregroundStyle(Tokens.placeholder))
                        .submitLabel(.send)
                        .onSubmit(send)
                        .onChange(of: text) { _, v in typed(v) }
                        .goLinkField()
                        .accessibilityIdentifier("chat-input")
                    SwiftUI.Button(action: send) {
                        Image(systemName: "paperplane.fill").foregroundStyle(Tokens.onAccent)
                            .frame(width: Tokens.control, height: Tokens.control)
                            .background(Circle().fill(text.trimmingCharacters(in: .whitespaces).isEmpty ? Tokens.surface2 : Tokens.accent))
                    }
                    .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityLabel(L("room_send"))
                    .accessibilityIdentifier("chat-send")
                }
                .padding(.vertical, 10)
            }
        }
    }

    private func typed(_ v: String) {
        if v.count > 300 { text = String(v.prefix(300)) }
        let now = Date()
        if !v.trimmingCharacters(in: .whitespaces).isEmpty {
            if typingSent.map({ now.timeIntervalSince($0) > 2.5 }) ?? true {
                typingSent = now
                session.client.sendTyping(true)
            }
        } else if typingSent != nil {
            typingSent = nil
            session.client.sendTyping(false)
        }
    }

    private func send() {
        guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        session.client.sendChat(text)
        text = ""
        typingSent = nil // the device clears "typing" with the message
    }
}

struct ChatLineView: View {
    let line: ChatLine
    let myName: String?

    var body: some View {
        switch line {
        case let .system(text, _, event, args):
            Text(systemText(text: text, event: event, args: args))
                .font(.caption).foregroundStyle(Tokens.faint)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        case let .user(name, port, _, text, _):
            let mine = name == myName
            VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
                Text(localName(name) + (port.map { " · P\($0)" } ?? ""))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(port.map { Tokens.player($0) } ?? Tokens.muted)
                Text(text)
                    .font(.subheadline).foregroundStyle(Tokens.text)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 14).fill(mine ? Tokens.accent.opacity(0.16) : Tokens.surface2))
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
        }
    }
}

/** Seats with swap / move / silence, the queue, and watching. */
struct PlayersPanel: View {
    @ObservedObject var session: RoomSession

    var body: some View {
        if let room = session.ui.room {
            let myPort = room.myPorts.first
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(Array(room.seats.enumerated()), id: \.offset) { i, seat in
                        seatRow(port: i + 1, seat: seat, room: room, myPort: myPort)
                    }
                    HStack {
                        Text(L("queue_summary", room.queue.count, room.spectators.count)).font(.footnote).foregroundStyle(Tokens.muted)
                        Spacer()
                        switch room.me {
                        case .spectator:
                            SwiftUI.Button(L("room_join_queue")) { session.client.joinQueue() }
                                .font(.footnote.weight(.semibold)).foregroundStyle(Tokens.accent)
                                .frame(minHeight: Tokens.control)
                                .accessibilityIdentifier("players-queue")
                        default:
                            SwiftUI.Button(L("room_spectate")) { session.client.spectate() }
                                .font(.footnote.weight(.semibold)).foregroundStyle(Tokens.accent)
                                .frame(minHeight: Tokens.control)
                                .accessibilityIdentifier("players-spectate")
                        }
                    }
                    if !room.queue.isEmpty {
                        section(L("room_queue_title"))
                        ForEach(Array(room.queue.enumerated()), id: \.offset) { _, q in
                            nameLine("\(ordinal(q.position))  \(localName(q.name))", you: q.you)
                        }
                    }
                    if !room.spectators.isEmpty {
                        section(L("room_spectators_title"))
                        ForEach(Array(room.spectators.enumerated()), id: \.offset) { _, s in
                            nameLine(localName(s.name), you: s.you)
                        }
                    }
                }
                .padding(14)
            }
        } else {
            Spacer()
        }
    }

    private func seatRow(port: Int, seat: SeatView?, room: RoomStateView, myPort: Int?) -> some View {
        let color = Tokens.player(port)
        let asked = room.you.swapAsked.contains { $0.to == port }
        return HStack(spacing: 10) {
            Text("P\(port)")
                .font(.system(size: 12, weight: .bold)).foregroundStyle(color)
                .frame(width: 34, height: 34)
                .overlay(Circle().strokeBorder(color, style: StrokeStyle(lineWidth: 2, dash: seat == nil ? [4, 3] : [])))
            VStack(alignment: .leading, spacing: 2) {
                Text(seat.map { localName($0.name) + ($0.you ? " (\(L("room_you")))" : "") } ?? L("room_seat_free"))
                    .font(.subheadline).foregroundStyle(seat == nil ? Tokens.faint : Tokens.text).lineLimit(1)
                if asked { Text(L("room_swap_waiting", port)).font(.caption).foregroundStyle(Tokens.muted) }
            }
            Spacer(minLength: 4)
            if let seat, !seat.you, session.sound.voices.contains(port) {
                SwiftUI.Button(L(session.sound.silenced.contains(port) ? "room_unsilence" : "room_silence")) { session.toggleSilence(port) }
                    .font(.caption.weight(.semibold)).foregroundStyle(Tokens.voice)
                    .frame(minHeight: Tokens.control)
            }
            if seat?.you == true {
                Text(L("seat_playing")).font(.caption).foregroundStyle(Tokens.muted)
            } else if let myPort {
                SwiftUI.Button(seat == nil ? L("room_move_here", port) : L("room_ask_swap", port)) {
                    session.client.swapSeat(from: myPort, to: port)
                }
                .font(.caption.weight(.semibold)).foregroundStyle(Tokens.accent)
                .frame(minHeight: Tokens.control)
                .accessibilityIdentifier("seat-\(port)-action")
            }
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 48)
        .background(RoundedRectangle(cornerRadius: 14).fill(Tokens.surface2))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(seat?.you == true ? Tokens.accentTintBorder : .clear, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("seat-\(port)")
    }

    private func section(_ title: String) -> some View {
        Text(title).font(.footnote.weight(.semibold)).foregroundStyle(Tokens.muted)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
    }

    private func nameLine(_ text: String, you: Bool) -> some View {
        Text(text + (you ? " (\(L("room_you")))" : "")).font(.subheadline)
            .foregroundStyle(you ? Tokens.accent : Tokens.text2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/** Your seat, your name, sound, help and the way out. */
struct YouPanel: View {
    @ObservedObject var session: RoomSession
    @EnvironmentObject private var model: AppModel
    let onSound: () -> Void
    let onHelp: () -> Void
    let onLeave: () -> Void
    @State private var name = ""
    @State private var saved = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let me = session.ui.room?.me {
                    HStack(spacing: 10) {
                        if case let .player(ports) = me {
                            ForEach(ports, id: \.self) { p in
                                Text("P\(p)").font(.system(size: 14, weight: .bold)).foregroundStyle(Tokens.onAccent)
                                    .padding(.horizontal, 10).frame(height: 32)
                                    .background(RoundedRectangle(cornerRadius: 8).fill(Tokens.player(p)))
                            }
                            Text(L("you_playing")).fontWeight(.semibold).foregroundStyle(Tokens.text)
                        } else {
                            Text(meLine(me)).fontWeight(.semibold).foregroundStyle(Tokens.text)
                        }
                    }
                    .accessibilityIdentifier("you-seat")
                }
                NameField(text: $name, identifier: "you-name", allowEmpty: true) {
                    if NameField.canSave(name, allowEmpty: true) { save() }
                }
                .onChange(of: name) { _, _ in saved = false }
                SecondaryButton(title: L("settings_save"), icon: saved ? "checkmark" : nil, enabled: NameField.canSave(name, allowEmpty: true), action: save)
                    .accessibilityIdentifier("you-name-save")
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    SecondaryButton(title: L("you_volume_voice"), action: onSound).accessibilityIdentifier("you-sound")
                    SecondaryButton(title: L("you_how_to_play"), action: onHelp).accessibilityIdentifier("you-help")
                }
                if !session.controllers.isEmpty {
                    Text(L("you_controllers")).font(.footnote.weight(.semibold)).foregroundStyle(Tokens.muted)
                    ForEach(session.controllers) { c in
                        Label(L("you_controller_player", c.name, c.player + 1), systemImage: "gamecontroller")
                            .font(.subheadline).foregroundStyle(Tokens.text2)
                    }
                }
                SecondaryButton(title: L("you_leave"), danger: true, action: onLeave).accessibilityIdentifier("you-leave")
            }
            .padding(14)
        }
        .onAppear { name = model.prefs.playerName }
    }

    private func save() {
        model.setName(name)
        name = model.prefs.playerName
        saved = true
    }
}
