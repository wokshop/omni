import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAddActions } from "@/components/drive/add-menu.tsx";
import {
  IconCompose,
  IconFile,
  IconFolderPlus,
  IconImage,
  IconMenu,
  IconPlus,
} from "@/components/icons.ts";
import { BottomSheet, useSheet } from "@/components/ui/bottom-sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FloatingButton } from "@/components/ui/floating.tsx";
import { Text } from "@/components/ui/text.tsx";
import type { CrmPage } from "@/lib/crm.ts";
import { DRIVE_PAGES } from "@/lib/drive.ts";
import { colors, iconSize, space } from "@/theme/tokens.ts";
import type { FloatingBarAction } from "./floating-bar.tsx";
import { useMenu } from "./menu-context.tsx";
import { SHELL_CONTROL, useMenuPlace, type Module } from "./menu-nav.ts";
import { MenuRow } from "./menu-row.tsx";
import { usePageTitle } from "./use-page-title.ts";

const FADE_MS = 180;
const SIDE = space(4);

const NEW_RECORD: Record<CrmPage, { kind: string; label: string }> = {
  companies: { kind: "company", label: "New company" },
  people: { kind: "person", label: "New person" },
  deals: { kind: "deal", label: "New deal" },
  projects: { kind: "deal", label: "New deal" },
  tasks: { kind: "task", label: "New task" },
};

/**
 * The shell's top bar on a module's root page: ☰ on the left (opens the left sidebar drawer),
 * the page's title and count centred, and the current module's main action as a pill button on
 * the right. Its hairline shows once rows have scrolled under it.
 */
export function TopBar() {
  const shell = useMenu();
  const place = useMenuPlace();
  const adding = useSheet();
  const insets = useSafeAreaInsets();
  const page = usePageTitle();
  const edge = useCrossfade(shell.scrolled && !shell.isOpen);
  const { close, setScrolled } = shell;
  useEffect(() => setScrolled(false), [page.title, place.mailbox, setScrolled]);

  const shared = place.drivePage === "shared";
  const add = useAddActions({ space: shared ? "shared" : "personal" });
  const record = NEW_RECORD[place.crmPage ?? "companies"];

  const actions: Partial<Record<Module, FloatingBarAction & { title: string }>> = {
    mail: {
      icon: IconCompose,
      title: "Compose",
      label: "New message",
      onPress: () => {
        close();
        router.push({
          pathname: "/mail/compose",
          params: place.mailbox ? { mailbox: place.mailbox } : {},
        });
      },
    },
    drive: {
      icon: IconPlus,
      title: "Add",
      label: "Add",
      onPress: () => {
        close();
        adding.open();
      },
    },
    crm: {
      icon: IconPlus,
      title: "New",
      label: record.label,
      onPress: () => {
        close();
        if (record.kind === "task") router.push("/crm/task-new");
        else router.push({ pathname: "/crm/form", params: { kind: record.kind } });
      },
    },
  };

  const action = actions[place.module];

  if (shell.searching) return null;
  return (
    <>
      <View style={[styles.bar, { paddingTop: insets.top + space(2) }]}>
        <Animated.View pointerEvents="none" style={[styles.edge, { opacity: edge }]} />
        <View style={styles.leftSlot}>
          <FloatingButton
            icon={IconMenu}
            glyph={iconSize.md}
            label={shell.isOpen ? "Close menu" : "Open menu"}
            compact
            onPress={shell.toggle}
          />
        </View>
        <View style={styles.center}>
          <Text weight="semibold" numberOfLines={1} accessibilityRole="header" style={styles.title}>
            {page.title}
          </Text>
          {page.count ? (
            <Text size="subhead" tone="mutedForeground" tabular>
              {page.count}
            </Text>
          ) : null}
        </View>
        <View style={styles.rightSlot}>
          {action ? (
            <Button
              size="sm"
              icon={action.icon}
              label={action.title}
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={styles.actionButton}
            />
          ) : null}
        </View>
      </View>
      <BottomSheet
        isOpen={adding.isOpen}
        onClose={adding.close}
        onClosed={adding.onClosed}
        title={`Add to ${DRIVE_PAGES[shared ? "shared" : "my"].label}`}
      >
        <MenuRow
          icon={IconFolderPlus}
          muted
          label="New folder"
          onPress={() => adding.pick(add.newFolder)}
        />
        <MenuRow
          icon={IconImage}
          muted
          label="Photos and videos"
          onPress={() => adding.pick(add.uploadMedia)}
        />
        <MenuRow
          icon={IconFile}
          muted
          label="Choose file"
          onPress={() => adding.pick(add.uploadFiles)}
        />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SIDE,
    paddingBottom: space(2.5),
    backgroundColor: colors.background,
  },
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  leftSlot: { flex: 1, height: SHELL_CONTROL, alignItems: "flex-start", justifyContent: "center" },
  rightSlot: { flex: 1, height: SHELL_CONTROL, alignItems: "flex-end", justifyContent: "center" },
  center: {
    flexShrink: 1,
    height: SHELL_CONTROL,
    marginHorizontal: space(2),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5),
  },
  actionButton: { minHeight: space(9.5), paddingHorizontal: space(3.5) },
  title: { flexShrink: 1 },
});

function useCrossfade(on: boolean) {
  const value = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    const fade = Animated.timing(value, {
      toValue: on ? 1 : 0,
      duration: FADE_MS,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [on, value]);
  return value;
}
