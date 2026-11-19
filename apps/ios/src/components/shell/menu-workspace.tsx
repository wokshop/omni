import type { Workspace } from "@omni/client";
import { router } from "expo-router";
import { useState } from "react";
import {
  IconConnections,
  IconLogOut,
  IconPlus,
  IconSettings,
  IconUpgrade,
  IconUserAdd,
  IconUserRound,
} from "@/components/icons.ts";
import { Avatar, AvatarButton } from "@/components/ui/avatar.tsx";
import { BottomSheet } from "@/components/ui/bottom-sheet.tsx";
import { usePictureSource } from "@/lib/picture.ts";
import { signOut, useSession } from "@/lib/session.ts";
import { openWorkspace, useWorkspace, workspaceLabel } from "@/lib/workspace.ts";
import {
  openWeb,
  useWorkspaceMenu,
  webSettingsPath,
  type WebSettingsPage,
} from "@/lib/workspace-menu.ts";
import { space } from "@/theme/tokens.ts";
import { ChoiceRow } from "./mailbox-chooser.tsx";
import { MenuDivider, MenuRow } from "./menu-row.tsx";

const AVATAR = space(11);
const SHEET_LEAD = space(9);

/**
 * The top bar's right button: the workspace's avatar (its logo, else its initial), a circle
 * the size of ☰'s. A tap opens the Workspaces sheet, as the desktop's workspace menu: every
 * workspace you belong to (the current one checked), New workspace, the settings pages, and
 * Log out.
 */
export function WorkspaceButton() {
  const { active, all } = useWorkspace();
  const name = useSession().data?.user.name;
  const [open, setOpen] = useState(false);
  const logo = usePictureSource(active?.logo);
  const menu = useWorkspaceMenu(!!active && active.kind !== "personal");
  if (!active) return null;
  const label = workspaceLabel(active, name);
  const pick = (then: () => void) => {
    setOpen(false);
    then();
  };
  const web = (page: WebSettingsPage) => pick(() => openWeb(webSettingsPath(active.slug, page)));
  return (
    <>
      <AvatarButton
        name={label}
        size={AVATAR}
        photo={logo}
        inverse
        label={`Workspace, ${label}`}
        onPress={() => setOpen(true)}
      />
      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Workspaces">
        {all.map((workspace) => (
          <WorkspaceChoice
            key={workspace.id}
            workspace={workspace}
            name={workspaceLabel(workspace, name)}
            chosen={workspace.id === active.id}
            onPress={() => pick(() => workspace.id === active.id || openWorkspace(workspace.id))}
          />
        ))}
        {menu.canCreate && (
          <MenuRow
            icon={IconPlus}
            label="New workspace"
            onPress={() => pick(() => openWeb("/onboarding"))}
          />
        )}
        <MenuDivider />
        <MenuRow
          icon={IconUserRound}
          label="Account settings"
          onPress={() => pick(() => router.push("/settings"))}
        />
        <MenuRow icon={IconSettings} label="Workspace settings" onPress={() => web("general")} />
        <MenuRow icon={IconConnections} label="Connections" onPress={() => web("accounts")} />
        {(menu.invite || menu.upgrade) && <MenuDivider />}
        {menu.invite && (
          <MenuRow icon={IconUserAdd} label="Invite members" onPress={() => web("people")} />
        )}
        {menu.upgrade && (
          <MenuRow icon={IconUpgrade} label="Upgrade" onPress={() => web("billing")} />
        )}
        <MenuDivider />
        <MenuRow icon={IconLogOut} label="Log out" onPress={() => pick(() => void signOut())} />
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
  const photo = usePictureSource(props.workspace.logo);
  return (
    <ChoiceRow
      lead={<Avatar name={props.name} size={SHEET_LEAD} photo={photo} inverse />}
      name={props.name}
      chosen={props.chosen}
      onPress={props.onPress}
    />
  );
}
