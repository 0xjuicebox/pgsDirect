// src/utils/webAlert.ts
//
// React Native Web does not implement Alert.alert — calls are silently
// dropped. Every error path in the admin app goes through Alert.alert, so in
// a browser a failed request produced a spinner and then nothing at all.
// A 500 from the server looked identical to a button that did nothing.
//
// This patches Alert.alert on web only, mapping it onto window.alert /
// window.confirm. Native is untouched.
//
// Install once, as the FIRST import in src/app/_layout.tsx:
//
//     import '../utils/webAlert';
//
// Importing it for the side effect is deliberate — patching at the module
// level means every existing Alert.alert call site starts working without
// touching the ~40 places that use it.

import { Alert, Platform } from "react-native";

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

if (Platform.OS === "web") {
  const original = Alert.alert;

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const body = [title, message].filter(Boolean).join("\n\n");

    // No buttons, or a single acknowledge button → plain alert.
    if (!buttons || buttons.length === 0) {
      window.alert(body);
      return;
    }
    if (buttons.length === 1) {
      window.alert(body);
      buttons[0]?.onPress?.();
      return;
    }

    // Two or more → confirm. The "confirm" action is the first button that
    // isn't a cancel; the cancel handler runs on dismiss. This collapses
    // three-button dialogs down to two, which is a real loss of fidelity —
    // but every three-button case in this app is
    // {cancel, safe-option, destructive}, and getting the destructive one
    // behind an explicit confirm is the part that matters.
    const cancelBtn = buttons.find((b) => b.style === "cancel");
    const actionBtn =
      buttons.find((b) => b.style !== "cancel") ?? buttons[buttons.length - 1];

    if (window.confirm(body)) {
      actionBtn?.onPress?.();
    } else {
      cancelBtn?.onPress?.();
    }
  };

  // Keep a handle on the original in case something needs the native path.
  (Alert as any).__nativeAlert = original;
}

export {};
