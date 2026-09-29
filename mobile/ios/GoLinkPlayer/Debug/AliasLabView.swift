// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

#if DEBUG
import SwiftUI

/**
 * Debug builds only (launch argument -aliasLab): the room's name step on
 * its own, without a room, so a UI test can check the validation.
 * "alias-result" shows the name "Enter the room" would send.
 */
struct AliasLabView: View {
    @State private var entered = ""

    var body: some View {
        ZStack(alignment: .top) {
            AliasView(initial: "", onEnter: { entered = $0 }, onBack: { entered = "" })
            Text(entered).font(.caption.monospaced()).foregroundStyle(Tokens.faint)
                .accessibilityIdentifier("alias-result")
        }
    }
}
#endif
