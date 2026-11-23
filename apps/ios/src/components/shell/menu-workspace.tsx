import type { Workspace } from "@omni/client";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import {
  IconChevronsUpDown,
  IconConnections,
  IconLogOut,
  IconPlus,
  IconSettings,
  IconUpgrade,
  IconUserAdd,
  IconUserRound,
} from "@/components/icons.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { BottomSheet, useSheet } from "@/components/ui/bottom-sheet.tsx";
import { PressableRow } from "@/components/ui/pressable-row.tsx";
import { Text } from "@/components/ui/text.tsx";
import { usePictureSource } from "@/lib/picture.ts";
import { signOut, useSession } from "@/lib/session.ts";
import { openOnWeb, useWorkspaceMenu } from "@/lib/workspace-menu.ts";
import { openWorkspace, useWorkspace, workspaceLabel } from "@/lib/workspace.ts";
import { colors, iconSize, radius, space } from "@/theme/tokens.ts";
import { ChoiceRow } from "./mailbox-chooser.tsx";
import { useMenuPlace } from "./menu-nav.ts";
import { MenuRow, SheetDivider } from "./menu-row.tsx";

const AVATAR = space(8);
const SHEET_LEAD = space(9);

/**
 * The left drawer's footer row: the active workspace's avatar, name, and up/down chevron.
 * A tap opens the workspace & account sheet (switch workspace, settings, connections, log out).
 */
export function WorkspaceButton() {
  const { active, all } = useWorkspace();
  const name = useSession().data?.user.name;
  const sheet = useSheet();
  const place = useMenuPlace();
  const logo = usePictureSource(active?.logo);
  const menu = useWorkspaceMenu(active);
  if (!active) return null;
  const label = workspaceLabel(active, name);
  const { pick } = sheet;
  const switchTo = (id: string) => {
    openWorkspace(id);
    if (place.mailbox) place.openMail({ mailbox: null });
  };
  const settings = (page: "general" | "accounts" | "people" | "billing") =>
    pick(() => openOnWeb({ settings: page, workspace: active }));
  return (
    <>
      <PressableRow
        shape="nav"
        accessibilityLabel={`Workspace, ${label}`}
        onPress={sheet.open}
        style={styles.trigger}
      >
        <Avatar name={label} size={AVATAR} photo={logo} inverse />
        <Text size="body" weight="medium" numberOfLines={1} style={styles.triggerLabel}>
          {label}
        </Text>
        <IconChevronsUpDown size={iconSize.sm} color={colors.mutedForeground} />
      </PressableRow>
      <BottomSheet
        isOpen={sheet.isOpen}
        onClose={sheet.close}
        onClosed={sheet.onClosed}
        title="Workspaces"
      >
        {all.map((workspace) => (
          <WorkspaceChoice
            key={workspace.id}
            workspace={workspace}
            name={workspaceLabel(workspace, name)}
            chosen={workspace.id === active.id}
            onPress={() => pick(() => workspace.id === active.id || switchTo(workspace.id))}
          />
        ))}
        {menu.canCreate ? (
          <MenuRow
            lead={
              <View style={styles.newLead}>
                <IconPlus size={iconSize.field} color={colors.mutedForeground} />
              </View>
            }
            leadWidth={SHEET_LEAD}
            label="New workspace"
            onPress={() => pick(() => openOnWeb("onboarding"))}
          />
        ) : null}
        <SheetDivider />
        <MenuRow
          leadWidth={SHEET_LEAD}
          icon={IconUserRound}
          muted
          label="Account settings"
          onPress={() => pick(() => router.push("/settings"))}
        />
        <MenuRow
          leadWidth={SHEET_LEAD}
          icon={IconSettings}
          muted
          label="Workspace settings"
          onPress={() => settings("general")}
        />
        <MenuRow
          leadWidth={SHEET_LEAD}
          icon={IconConnections}
          muted
          label="Connections"
          onPress={() => settings("accounts")}
        />
        {menu.team || menu.upgrade ? <SheetDivider /> : null}
        {menu.team ? (
          <MenuRow
            leadWidth={SHEET_LEAD}
            icon={IconUserAdd}
            muted
            label="Invite members"
            onPress={() => settings("people")}
          />
        ) : null}
        {menu.upgrade ? (
          <MenuRow
            icon={IconUpgrade}
            leadWidth={SHEET_LEAD}
            accent
            label="Upgrade"
            onPress={() => settings("billing")}
          />
        ) : null}
        <SheetDivider />
        <MenuRow
          leadWidth={SHEET_LEAD}
          icon={IconLogOut}
          muted
          label="Log out"
          onPress={() => pick(() => void signOut())}
        />
      </BottomSheet>
    </>
  );
}

function WorkspaceChoice(props: {
  workspace: Workspace;
  name: string;
  chosen: boolean;
  onPress: () => void;
}) {
  const logo = usePictureSource(props.workspace.logo);
  return (
    <ChoiceRow
      lead={<Avatar name={props.name} size={SHEET_LEAD} photo={logo} inverse />}
      name={props.name}
      chosen={props.chosen}
      onPress={props.onPress}
      style={styles.choice}
    />
  );
}

const styles = StyleSheet.create({
  trigger: { gap: space(2.5), paddingLeft: space(2), paddingRight: space(2.5) },
  triggerLabel: { flex: 1, minWidth: 0 },
  choice: { minHeight: space(15), paddingVertical: 0 },
  newLead: {
    width: SHEET_LEAD,
    height: SHEET_LEAD,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.hairlineLine,
    alignItems: "center",
    justifyContent: "center",
  },
});
