import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, radius, space } from "@/theme/tokens.ts";
import { useMenu } from "./menu-context.tsx";
import { useMenuPlace } from "./menu-nav.ts";
import { useModules, type ModuleEntry } from "./modules.ts";

/** Height of the bottom module switcher dock row. */
export const DOCK_HEIGHT = space(10);

/** The bottom dock: one tab per module; only the active one takes the darker grey pill. */
export function ModuleDock() {
  const modules = useModules();
  const place = useMenuPlace();
  const { close } = useMenu();

  const renderModule = (entry: ModuleEntry) => {
    const current = entry.id === place.module;
    const Mark = entry.mark;
    return (
      <Pressable
        key={entry.id}
        accessibilityRole="tab"
        accessibilityLabel={entry.label}
        accessibilityState={{ selected: current }}
        onPress={() => {
          if (current) {
            close();
            return;
          }
          void Haptics.selectionAsync();
          close();
          place.openModule(entry.id);
        }}
        style={({ pressed }) => [styles.slot, current && styles.current, pressed && styles.pressed]}
      >
        <Mark size={22} />
      </Pressable>
    );
  };

  return (
    <View accessibilityRole="tablist" style={styles.dock}>
      {modules.map(renderModule)}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(5),
  },
  slot: {
    width: space(13),
    height: DOCK_HEIGHT,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  current: {
    backgroundColor: colors.well,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
});
