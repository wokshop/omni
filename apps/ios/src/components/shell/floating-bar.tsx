import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  StyleSheet,
  View,
  type KeyboardEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SvgProps } from "react-native-svg";
import { IconSearch, IconX } from "@/components/icons.ts";
import { FloatingButton, FloatingField } from "@/components/ui/floating.tsx";
import { TextField } from "@/components/ui/text-field.tsx";
import { floatingControl, iconSize, space, text } from "@/theme/tokens.ts";
import { DOCK_HEIGHT } from "./module-dock.tsx";

/** How far a list under the bar and dock scrolls past its last row, so chrome never covers it. */
export const FLOATING_BAR_SPACE = floatingControl + DOCK_HEIGHT + space(12);

const SIDE = space(4);

export interface FloatingBarAction {
  icon: ComponentType<SvgProps & { size?: number }>;
  label: string;
  onPress: () => void;
}

/**
 * The shell's bottom controls: at rest, the module's primary action button floating on the right
 * above the bottom module dock; when `searching` is active (triggered by the dock's center Search
 * icon), a live search field and close button ride above the keyboard.
 */
export function FloatingBar({
  placeholder,
  action,
  searching,
  onSearch,
  onStop,
  query,
  dock,
}: {
  placeholder: string;
  searching: boolean;
  /** What the open field shows, when the page under it can fill it (a recent search). */
  query?: string;
  action?: FloatingBarAction;
  onSearch: (q: string) => void;
  /** The field closed. */
  onStop?: () => void;
  /** The module switcher dock rendered beneath the action button when not searching. */
  dock?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [q, setQ] = useState(query ?? "");
  const stop = () => {
    Keyboard.dismiss();
    setQ("");
    onSearch("");
    onStop?.();
  };
  const bottom =
    searching && keyboard ? keyboard + space(2.5) : Math.max(insets.bottom - space(1), space(3));
  return (
    <View pointerEvents="box-none" style={[styles.stack, { paddingBottom: bottom }]}>
      {searching ? (
        <View pointerEvents="box-none" style={[styles.row, styles.open]}>
          <FloatingField icon={IconSearch}>
            <TextField
              label={placeholder}
              placeholder={placeholder}
              variant="bare"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              value={query ?? q}
              onChangeText={(next) => {
                setQ(next);
                onSearch(next);
              }}
              containerStyle={styles.field}
              style={text.body}
            />
          </FloatingField>
          <FloatingButton
            icon={IconX}
            label="Close search"
            searching
            glyph={iconSize.field}
            onPress={stop}
          />
        </View>
      ) : (
        <>
          {action ? (
            <View pointerEvents="box-none" style={styles.actionRow}>
              <FloatingButton
                icon={action.icon}
                label={action.label}
                onPress={action.onPress}
                primary
              />
            </View>
          ) : null}
          {dock}
        </>
      )}
    </View>
  );
}

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const follow = (shown: boolean) => (event?: KeyboardEvent) => {
      if (event?.duration) {
        LayoutAnimation.configureNext(
          LayoutAnimation.create(event.duration, LayoutAnimation.Types.keyboard, "opacity"),
        );
      }
      setHeight(shown ? (event?.endCoordinates.height ?? 0) : 0);
    };
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", follow(true));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", follow(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: space(2.5),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    paddingHorizontal: SIDE,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SIDE,
  },
  open: { paddingHorizontal: space(3) },
  field: { flex: 1, minWidth: 0 },
});
