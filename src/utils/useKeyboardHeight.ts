import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Returns the current on-screen keyboard height in pixels, 0 when hidden.
 *
 * WHY THIS EXISTS RATHER THAN KeyboardAvoidingView
 *
 * KeyboardAvoidingView does not work inside a React Native <Modal> on Android.
 * A Modal opens its own native window, and `behavior="height"` depends on the
 * activity being resized by `adjustResize` — which applies to the main
 * activity's window, not the modal's. The component renders, changes nothing,
 * and the keyboard covers the sheet.
 *
 * That is why the create-route drawer stayed under the keyboard even after
 * being wrapped: the wrapper was correct and inert.
 *
 * Measuring the keyboard directly and applying it as padding works in both
 * windows, on both platforms, with no dependency on manifest flags.
 *
 * iOS reports `keyboardWillShow` before the animation, which lets the sheet
 * move in step with the keyboard. Android only has `keyboardDidShow`, so the
 * sheet snaps up a moment later — visible, but far better than being covered.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
