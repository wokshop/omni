// The mailbox switcher in the sidebar header: which mailbox the app shows, one workspace's, or
// all of them (ADR 0024). The UX follows a mail app's account menu: All, then each mailbox,
// grouped by workspace only when the user belongs to more than one; each group opens with its
// workspace's own row. Settings and log out live in the sidebar footer.
//
// Geometry, so the menu breathes and balances optically:
// - Every row is 50px: a 32px avatar beside a 34px two-line block (13/16 name, 2px, 11/16
//   address), nothing clipped. Each mark is even inside its own corner of the row: the avatar
//   9px from the row's top and left, the check's ink the same distance from its top and right.
// - The menu's 8px padding puts avatars 17px from its edges.
// - A group sits 8px under the one above, past the rows' own 8px.
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { useSearch } from "@tanstack/react-router";
import { cn } from "cn";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Menu, MenuItem, MenuSection, MenuTrigger } from "@/components/ui/menu";
import { appToast } from "@/components/ui/toast";
import { useMember } from "@/hooks/use-session.ts";
import {
  useFocusWorkspace,
  useOpenMailbox,
  useOpenWorkspace,
  useWorkspaces,
} from "@/hooks/use-workspaces.ts";
import type { Workspace, WorkspaceMailbox } from "@/lib/types.ts";
import { pictureUrl } from "@/lib/urls.ts";

/** Rows are 50px (8px + the 34px text block + 8px). The 32px avatar sits 9px from the row's top
 *  and left; the check's ink 20px from its top and right (measured). Each mark is even inside its
 *  own corner. */
const ROW = "min-h-12 rounded-sm ps-2.25 pe-4.5 py-2";
/** The sign-in notice over the rows: muted, aligned with the avatars, 8px over the first row. */
const NOTICE =
  "max-w-72 px-2.25 pt-1 pb-2 text-xs/4 text-muted-foreground sm:px-2.25 sm:pt-1 sm:pb-2 sm:text-xs/4";
const ROW_CONTENT = "col-span-full flex min-w-0 items-center gap-3";

const failed = () => appToast.error("The mailbox could not be opened. Try again.");

/** A mailbox as the switcher shows it: who it is and their picture, if any. */
interface Face {
  key: string;
  name: string;
  image: string | null;
}

/**
 * What a mailbox is called: you, for your personal one; its local part for a shared one. With
 * several personal mailboxes (two Gmail accounts), your name tells them apart from nothing, so
 * each is its address.
 */
export function mailboxName(mailbox: WorkspaceMailbox, you: string, severalOfYours = false) {
  if (mailbox.kind === "personal") return severalOfYours ? mailbox.address : you;
  const local = mailbox.address.split("@")[0] ?? mailbox.address;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** A round avatar `size` px across: the picture when there is one, else the initial. Multiply:
 *  under the row's hover highlight the fill darkens with it instead of sitting on top. */
function FaceAvatar(props: { face: Face; size: number; plain?: boolean }) {
  return (
    <Avatar
      src={props.face.image}
      initials={props.plain ? undefined : props.face.name.slice(0, 1).toUpperCase()}
      className="bg-accent text-foreground outline-0 mix-blend-multiply"
      style={{ "--avatar-size": `${props.size}px` } as CSSProperties}
    />
  );
}

/**
 * "All mailboxes": the mailboxes' own avatars in a triangle over one avatar's square, two on top
 * and one below between them. With more than three, the last becomes "+N". Discs are half the
 * square and just touch, so none hides another. A ring in the fill behind them (`ring`) keeps a
 * hairline between neighbours on the menu, under the hover highlight and on the trigger.
 * `plain` drops initials and the count, for sizes where they would be specks.
 */
function Cluster(props: { faces: Face[]; size: number; ring: string; plain?: boolean }) {
  const { faces, size } = props;
  // Half-size discs that just touch, none hiding another: two on top, one centred below.
  const disc = size / 2;
  const spots = [
    { x: 0, y: size / 32 },
    { x: disc, y: size / 32 },
    { x: disc / 2, y: size - disc - size / 32 },
  ];
  const extra = faces.length - 3;
  const shown: (Face | { more: number })[] =
    extra > 0 ? [...faces.slice(0, 2), { more: extra + 1 }] : faces.slice(0, 3);
  return (
    <span aria-hidden className="relative block shrink-0" style={{ width: size, height: size }}>
      {shown.map((item, i) => {
        const spot = spots[i] ?? { x: 0, y: 0 };
        return (
          <span
            key={"more" in item ? "more" : item.key}
            className={cn("absolute flex rounded-full p-[1.5px]", props.ring)}
            style={{ left: spot.x - 1.5, top: spot.y - 1.5 }}
          >
            {"more" in item ? (
              <Avatar
                initials={props.plain ? undefined : `+${item.more}`}
                className="bg-accent text-muted-foreground outline-0 mix-blend-multiply"
                style={{ "--avatar-size": `${disc}px` } as CSSProperties}
              />
            ) : (
              <FaceAvatar face={item} size={disc} plain={props.plain} />
            )}
          </span>
        );
      })}
    </span>
  );
}

/** A row's avatar, two lines and the check on the one showing. */
function RowBody(props: { lead: React.ReactNode; name: string; detail: string; chosen: boolean }) {
  return (
    <span className={ROW_CONTENT}>
      <span className="grid size-8 shrink-0 place-items-center">{props.lead}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm/4 text-foreground">{props.name}</span>
        <span className="truncate text-xs/4 text-muted-foreground">{props.detail}</span>
      </span>
      <span aria-hidden className="grid size-4 shrink-0 place-items-center">
        {props.chosen && <CheckIcon className="size-4 text-foreground" />}
      </span>
    </span>
  );
}

/**
 * The trigger shares the header with three buttons, leaving its label 65px: "All mailboxes"
 * (99px) would clip, so it says "All" beside the cluster, and your only personal mailbox shows
 * your first name. The menu rows and the trigger's accessible name keep the full names.
 */
function triggerText(
  mailbox: string | undefined,
  workspace: string | undefined,
  options: { firstName: string | undefined },
) {
  const triggerName = mailbox ?? workspace ?? "All mailboxes";
  const triggerLabel = mailbox ? (options.firstName ?? mailbox) : (workspace ?? "All");
  return { triggerName, triggerLabel };
}

/** A workspace's row, leading its group: choosing it shows only its mailboxes. */
function WorkspaceRow(props: { workspace: Workspace; chosen: boolean; onAction: () => void }) {
  const { workspace } = props;
  const count = workspace.mailboxes.length;
  return (
    <MenuItem className={ROW} textValue={workspace.name} onAction={props.onAction}>
      <RowBody
        lead={
          <FaceAvatar face={{ key: workspace.id, name: workspace.name, image: null }} size={32} />
        }
        name={workspace.name}
        detail={`${count} ${count === 1 ? "mailbox" : "mailboxes"}`}
        chosen={props.chosen}
      />
    </MenuItem>
  );
}

/** What the switcher shows: the groups, which mailbox or workspace is in view, and the faces. */
function useSwitcher() {
  const { user, member } = useMember();
  const workspaces = useWorkspaces();
  const { mailbox: current, workspace: focused } = useSearch({ strict: false }) as {
    mailbox?: string;
    workspace?: string;
  };
  const all = workspaces.data?.workspaces ?? [];
  // A workspace still in setup has no mailboxes yet: no group with nothing in it.
  const groups = all.filter((workspace) => workspace.mailboxes.length > 0);
  const grouped = groups.length > 1;
  const you = user.name || user.email;
  const several =
    all.flatMap((w) => w.mailboxes).filter((box) => box.kind === "personal").length > 1;
  const name = (mailbox: WorkspaceMailbox) => mailboxName(mailbox, you, several);
  const face = (mailbox: WorkspaceMailbox): Face => ({
    key: mailbox.id,
    name: name(mailbox),
    image: mailbox.kind === "personal" ? pictureUrl(user.image) : null,
  });
  const active = all.find((workspace) => workspace.id === member.orgId);
  const shown = active?.mailboxes.find((box) => box.id === current);
  // One workspace in focus: only its mailboxes, as long as no single mailbox is open.
  const inFocus = !shown && grouped ? groups.find((w) => w.id === focused) : undefined;
  const leadFace: Face | undefined = shown
    ? face(shown)
    : inFocus && { key: inFocus.id, name: inFocus.name, image: null };
  // A session opened with a company's address reaches only that company (ADR 0024).
  const scopedTo = all.find((w) => w.id === workspaces.data?.scopedTo)?.name;
  return {
    scopedTo,
    member,
    current,
    groups,
    grouped,
    several,
    name,
    face,
    active,
    shown,
    inFocus,
    leadFace,
    faces: all.flatMap((workspace) => workspace.mailboxes.map(face)),
    ...triggerText(shown && name(shown), inFocus?.name, {
      firstName: shown?.kind === "personal" && !several ? (you.split(" ")[0] ?? you) : undefined,
    }),
  };
}

export function MailboxSwitcher() {
  const openWorkspace = useOpenWorkspace();
  const openMailbox = useOpenMailbox();
  const focusWorkspace = useFocusWorkspace();
  const pending = openWorkspace.isPending || openMailbox.isPending || focusWorkspace.isPending;
  const {
    scopedTo,
    member,
    current,
    groups,
    grouped,
    several,
    name,
    face,
    active,
    shown,
    inFocus,
    leadFace,
    faces,
    triggerName,
    triggerLabel,
  } = useSwitcher();

  const mailboxRows = (workspace: Workspace) =>
    workspace.mailboxes.map((mailbox) => (
      <MenuItem
        key={mailbox.id}
        className={ROW}
        textValue={mailbox.address}
        onAction={() =>
          openMailbox.mutate(
            { workspaceId: workspace.id, mailboxId: mailbox.id },
            { onError: failed },
          )
        }
      >
        <RowBody
          lead={<FaceAvatar face={face(mailbox)} size={32} />}
          name={name(mailbox)}
          detail={several && mailbox.kind === "personal" ? workspace.name : mailbox.address}
          chosen={workspace.id === member.orgId && mailbox.id === current}
        />
      </MenuItem>
    ));

  return (
    <MenuTrigger>
      <Button
        intent="plain"
        aria-label={`Switch mailbox, currently ${triggerName}`}
        // Hover, pressed and open share one fill. React Aria keeps the trigger pressed while its
        // menu is open, so the fill is set through the button's own variables. The lead is the
        // nav icons' 15px box, 8px in, with the label 10px after: the avatar's centre and the
        // label line up with the nav rows below.
        className="group/trigger h-7 min-w-0 flex-1 justify-start gap-2.5 rounded-sm px-2 [--btn-overlay:var(--color-accent)] aria-expanded:[--btn-bg:var(--color-accent)]"
      >
        <span className="grid size-icon shrink-0 place-items-center">
          {pending ? (
            <Loader className="size-icon text-muted-foreground" />
          ) : leadFace ? (
            // 18px over the 15px box: the grid would start it at the box's left edge (centre
            // 1.5px right of the nav icons'), so the margin centres it on the same axis.
            <span className="-m-[1.5px]">
              <FaceAvatar face={leadFace!} size={18} plain />
            </span>
          ) : (
            // 20px over the 15px box, centred on the same axis; at this size initials are
            // specks, so the discs are plain (pictures still show).
            <span className="-m-[2.5px]">
              <Cluster
                faces={faces}
                size={20}
                plain
                ring="bg-sidebar group-hover/trigger:bg-accent group-aria-expanded/trigger:bg-accent"
              />
            </span>
          )}
        </span>
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronUpDownIcon className="size-3.5 shrink-0 text-subtle-foreground" />
      </Button>

      <Menu
        placement="bottom start"
        popover={{
          offset: 8,
          // Fit-content like every menu; rows carry an avatar and two lines, so the cap is
          // raised to 320px (addresses truncate past it).
          className: "max-w-[min(20rem,calc(100vw-16px))] [--popover-radius:var(--radius-xl)]",
        }}
        className="p-2"
      >
        {/* One All row for every workspace, above the groups. A sign-in that reaches one
            company says so over it, so a missing Personal space is not a surprise. */}
        <MenuSection
          label={
            scopedTo && `Signed in with your ${scopedTo} address: only ${scopedTo} opens here.`
          }
          className="mt-0"
          labelClassName={NOTICE}
        >
          <MenuItem
            className={ROW}
            textValue="All mailboxes"
            onAction={() => active && openWorkspace.mutate(active, { onError: failed })}
          >
            <RowBody
              lead={
                <Cluster
                  faces={faces}
                  size={32}
                  // The ring is the fill behind the row: the menu's, or the hover highlight's.
                  ring="bg-overlay in-data-fluid-hover-active:bg-accent"
                />
              }
              name="All mailboxes"
              detail={`${faces.length} ${faces.length === 1 ? "mailbox" : "mailboxes"}`}
              chosen={!shown && !inFocus}
            />
          </MenuItem>
        </MenuSection>
        {grouped
          ? groups.map((workspace) => (
              // Each workspace leads its group as a row of its own: choosing it shows only its
              // mailboxes, the way a mailbox row shows only that mailbox.
              <MenuSection key={workspace.id} className="mt-2">
                <WorkspaceRow
                  workspace={workspace}
                  chosen={inFocus?.id === workspace.id}
                  onAction={() => focusWorkspace.mutate(workspace, { onError: failed })}
                />
                {mailboxRows(workspace)}
              </MenuSection>
            ))
          : groups[0] && mailboxRows(groups[0])}
      </Menu>
    </MenuTrigger>
  );
}
