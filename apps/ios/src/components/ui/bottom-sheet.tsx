import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@/theme/tokens.ts";
import { Text } from "./text.tsx";
import { useReduceMotion } from "./use-reduce-motion.ts";

const OPEN_MS = 320;
const CLOSE_MS = 240;

/**
 * A sheet that slides up from the bottom edge while the page behind it dims: a grabber, its
 * title, then its rows. A tap above it closes it, and it slides back down as the dim fades.
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const shown = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(isOpen);
  const [sheetHeight, setSheetHeight] = useState(height);
  const still = useReduceMotion();
  useEffect(() => {
    if (isOpen) setMounted(true);
    const move = Animated.timing(shown, {
      toValue: isOpen ? 1 : 0,
      duration: still ? 0 : isOpen ? OPEN_MS : CLOSE_MS,
      easing: isOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    move.start(({ finished }) => finished && !isOpen && setMounted(false));
    return () => move.stop();
  }, [isOpen, still, shown]);
  const translateY = shown.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] });
  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.scrim, { opacity: shown }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, space(10)), transform: [{ translateY }] },
        ]}
      >
        <View style={styles.grabber} />
        <View style={styles.title}>
          <Text weight="semibold" accessibilityRole="header">
            {title}
          </Text>
        </View>
        <ScrollView>{children}</ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "80%",
    paddingTop: space(2),
    paddingHorizontal: space(1.5),
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.background,
  },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  grabber: {
    alignSelf: "center",
    width: space(9),
    height: space(1.25),
    marginBottom: space(2),
    borderRadius: radius.full,
    backgroundColor: colors.hairlineLine,
  },
  title: { height: space(11), justifyContent: "center", paddingHorizontal: space(3.5) },
});
