import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomFade } from "@/components/ui/bottom-fade.tsx";
import { space } from "@/theme/tokens.ts";
import { ModuleDock } from "./module-dock.tsx";

/**
 * The shell's bottom bar on a module's root page: the 4 modules around the center Search tab,
 * fading the scrolling page behind it.
 */
export function BottomBar() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom - space(1), space(3));
  return (
    <>
      <BottomFade />
      <View pointerEvents="box-none" style={[styles.dockWrap, { paddingBottom: bottom }]}>
        <ModuleDock />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  dockWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
