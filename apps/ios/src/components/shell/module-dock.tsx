import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, iconSize, radius, space } from "@/theme/tokens.ts";
import type { FloatingBarAction } from "./floating-bar.tsx";
import { useMenu } from "./menu-context.tsx";
import { useMenuPlace } from "./menu-nav.ts";
import { useModules, type ModuleEntry } from "./modules.ts";

/** Height of the bottom module switcher dock row. */
export const DOCK_HEIGHT = space(10);

/**
 * The bottom dock: the 4 modules split symmetrically around the current module's primary action
 * (`Mail`, `Drive`, `[Compose / +]`, `CRM`, `Calendar`). Each module shows its desktop icon in
 * full colour, the active one sitting on a soft accent pill.
 */
export function ModuleDock({ action }: { action?: FloatingBarAction }) {
  const modules = useModules();
  const place = useMenuPlace();
  const { close } = useMenu();
  const split = Math.ceil(modules.length / 2);
  const left = modules.slice(0, split);
  const right = modules.slice(split);

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

  const ActionIcon = action?.icon;

  return (
    <View accessibilityRole="tablist" style={styles.dock}>
      {left.map(renderModule)}
      {action && ActionIcon ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            void Haptics.selectionAsync();
            action.onPress();
          }}
          style={({ pressed }) => [styles.actionSlot, pressed && styles.pressed]}
        >
          <ActionIcon size={iconSize.md} color={colors.primaryForeground} />
        </Pressable>
      ) : (
        <View style={styles.emptySlot} />
      )}
      {right.map(renderModule)}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: space(3),
  },
  slot: {
    width: space(13),
    height: DOCK_HEIGHT,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  actionSlot: {
    width: space(11),
    height: DOCK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.primaryButton,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySlot: {
    width: space(11),
    height: DOCK_HEIGHT,
  },
  current: {
    backgroundColor: colors.border,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
});
