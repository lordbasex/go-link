// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import SwiftUI
import UIKit

/**
 * The room code field: shows the 9 digits grouped while they are typed
 * ("915 355 636", GoLinkCore.CodeInput) and keeps the caret where the
 * person is editing. It also takes an invitation link, left as pasted, so
 * it keeps the default keyboard. A UITextField, because SwiftUI's
 * TextField cannot place the caret.
 */
struct CodeField: UIViewRepresentable {
    @Binding var text: String
    @Binding var focused: Bool
    var placeholder: String
    var identifier: String?
    var onSubmit: () -> Void = {}

    func makeUIView(context: Context) -> UITextField {
        let field = UITextField()
        field.delegate = context.coordinator
        field.keyboardType = .asciiCapable
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.smartDashesType = .no
        field.smartQuotesType = .no
        field.smartInsertDeleteType = .no
        field.returnKeyType = .next
        field.font = UIFont.monospacedSystemFont(ofSize: 18, weight: .medium)
        field.textColor = UIColor(Tokens.text)
        field.tintColor = UIColor(Tokens.accent)
        field.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: UIColor(Tokens.placeholder)]
        )
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        field.accessibilityIdentifier = identifier
        field.text = text
        return field
    }

    func updateUIView(_ field: UITextField, context: Context) {
        context.coordinator.parent = self
        if field.text != text { field.text = text }
        if focused && !field.isFirstResponder {
            DispatchQueue.main.async { if field.window != nil { field.becomeFirstResponder() } }
        } else if !focused && field.isFirstResponder {
            DispatchQueue.main.async { field.resignFirstResponder() }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: CodeField

        init(_ parent: CodeField) { self.parent = parent }

        func textField(_ field: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
            let current = field.text ?? ""
            guard let r = Range(range, in: current) else { return false }
            // CodeInput counts characters; the field reports UTF-16 ranges.
            let start = current.distance(from: current.startIndex, to: r.lowerBound)
            let end = current.distance(from: current.startIndex, to: r.upperBound)
            let out = CodeInput.edit(text: current, start: start, end: end, insert: string)
            field.text = out.text
            let offset = out.text.index(out.text.startIndex, offsetBy: min(out.caret, out.text.count)).utf16Offset(in: out.text)
            if let pos = field.position(from: field.beginningOfDocument, offset: offset) {
                field.selectedTextRange = field.textRange(from: pos, to: pos)
            }
            parent.text = out.text
            field.sendActions(for: .editingChanged)
            return false
        }

        func textFieldDidBeginEditing(_ field: UITextField) {
            if !parent.focused { parent.focused = true }
        }

        func textFieldDidEndEditing(_ field: UITextField) {
            if parent.focused { parent.focused = false }
        }

        func textFieldShouldReturn(_ field: UITextField) -> Bool {
            parent.onSubmit()
            return false
        }
    }
}
