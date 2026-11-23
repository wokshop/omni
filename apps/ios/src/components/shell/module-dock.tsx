import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { IconSearch } from "@/components/icons.ts";
import { colors, radius, space } from "@/theme/tokens.ts";
import { useMenu } from "./menu-context.tsx";
import { useMenuPlace } from "./menu-nav.ts";
import { useModules, type ModuleEntry } from "./modules.ts";

/** Height of the bottom module switcher dock row. */
export const DOCK_HEIGHT = space(10);

/**
 * The bottom dock: the 4 modules split symmetrically around a visitable center Search tab
 * (`Mail`, `Drive`, `🔍`, `CRM`, `Calendar`). Only the active tab takes the darker grey pill.
 */
export function ModuleDock({ isSearch = false }: { isSearch?: boolean }) {
  const modules = useModules();
  const place = useMenuPlace();
  const { close } = useMenu();
  const split = Math.ceil(modules.length / 2);
  const left = modules.slice(0, split);
  const right = modules.slice(split);

  const renderModule = (entry: ModuleEntry) => {
    const current = !isSearch && entry.id === place.module;
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
      {left.map(renderModule)}
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel="Search"
        accessibilityState={{ selected: isSearch }}
        onPress={() => {
          if (isSearch) return;
          void Haptics.selectionAsync();
          close();
          router.replace({ pathname: "/search", params: { in: place.module } });
        }}
        style={({ pressed }) => [
          styles.slot,
          isSearch && styles.current,
          pressed && styles.pressed,
        ]}
      >
        <IconSearch
          size={21}
          strokeWidth={2}
          color={isSearch ? colors.foreground : colors.mutedForeground}
        />
      </Pressable>
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
  current: {
    backgroundColor: colors.border,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
});
