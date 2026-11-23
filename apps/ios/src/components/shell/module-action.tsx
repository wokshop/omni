import { router } from "expo-router";
import { useAddActions } from "@/components/drive/add-menu.tsx";
import { IconCompose, IconFile, IconFolderPlus, IconImage, IconPlus } from "@/components/icons.ts";
import { BottomSheet, useSheet } from "@/components/ui/bottom-sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { CrmPage } from "@/lib/crm.ts";
import { DRIVE_PAGES } from "@/lib/drive.ts";
import { space } from "@/theme/tokens.ts";
import { StyleSheet } from "react-native";
import type { FloatingBarAction } from "./floating-bar.tsx";
import { useMenu } from "./menu-context.tsx";
import { useMenuPlace, type Module } from "./menu-nav.ts";
import { MenuRow } from "./menu-row.tsx";

const NEW_RECORD: Record<CrmPage, { kind: string; label: string }> = {
  companies: { kind: "company", label: "New company" },
  people: { kind: "person", label: "New person" },
  deals: { kind: "deal", label: "New deal" },
  projects: { kind: "deal", label: "New deal" },
  tasks: { kind: "task", label: "New task" },
};

/**
 * The current module's main CTA pill (Compose in Mail, Add in Drive, New in CRM), shared between
 * the top-right bar and the bottom-right of the left sidebar drawer.
 */
export function ModuleActionPill() {
  const { close } = useMenu();
  const place = useMenuPlace();
  const adding = useSheet();
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
  if (!action) return null;

  return (
    <>
      <Button
        size="sm"
        icon={action.icon}
        label={action.title}
        accessibilityLabel={action.label}
        onPress={action.onPress}
        style={styles.button}
      />
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
  button: { minHeight: space(9.5), paddingHorizontal: space(3.5) },
});
