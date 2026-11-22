import { cn } from "cn";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  IconAnalyticsFilled,
  IconArchiveFilled,
  IconBookFilled,
  IconBrushFilled,
  IconBuildingsFilled,
  IconCodeFilled,
  IconCoinsFilled,
  IconGlobeFilled,
  IconHeartFilled,
  IconHomeFilled,
  IconLightBulbFilled,
  IconLockFilled,
  IconMegaphoneFilled,
  IconPackageFilled,
  IconRocketFilled,
  IconSparkleFilled,
  IconStarFilled,
  IconTargetFilled,
  IconTrophyFilled,
  IconUsersFilled,
  IconVideoFilled,
} from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUpdateTeamspace } from "@/hooks/use-storage.ts";
import type { StorageSpaceIcon } from "@/lib/storage.ts";
import type { StorageTeamspace } from "@/lib/storage-teamspaces.ts";
import { storageErrorToast } from "./storage-errors.ts";

type Glyph = ComponentType<{ className?: string }>;

/** Each glyph and the name a screen reader gives it: `STORAGE_FOLDER_ICONS`, which the API checks. */
export const SPACE_ICONS = {
  rocket: { icon: IconRocketFilled, label: "Rocket" },
  star: { icon: IconStarFilled, label: "Star" },
  heart: { icon: IconHeartFilled, label: "Heart" },
  sparkle: { icon: IconSparkleFilled, label: "Sparkle" },
  "light-bulb": { icon: IconLightBulbFilled, label: "Light bulb" },
  target: { icon: IconTargetFilled, label: "Target" },
  trophy: { icon: IconTrophyFilled, label: "Trophy" },
  megaphone: { icon: IconMegaphoneFilled, label: "Megaphone" },
  analytics: { icon: IconAnalyticsFilled, label: "Chart" },
  coins: { icon: IconCoinsFilled, label: "Coins" },
  buildings: { icon: IconBuildingsFilled, label: "Buildings" },
  globe: { icon: IconGlobeFilled, label: "Globe" },
  home: { icon: IconHomeFilled, label: "Home" },
  book: { icon: IconBookFilled, label: "Book" },
  code: { icon: IconCodeFilled, label: "Code" },
  brush: { icon: IconBrushFilled, label: "Brush" },
  video: { icon: IconVideoFilled, label: "Video" },
  archive: { icon: IconArchiveFilled, label: "Archive" },
  package: { icon: IconPackageFilled, label: "Package" },
  lock: { icon: IconLockFilled, label: "Lock" },
} as const satisfies Record<string, { icon: Glyph; label: string }>;
type SpaceIconKey = keyof typeof SPACE_ICONS & StorageSpaceIcon;

const known = (icon: string | null | undefined): icon is SpaceIconKey =>
  !!icon && icon in SPACE_ICONS;

const TONES = [
  "bg-space-1",
  "bg-space-2",
  "bg-space-3",
  "bg-space-4",
  "bg-space-5",
  "bg-space-6",
  "bg-space-7",
  "bg-space-8",
] as const;

function toneOf(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TONES[Math.abs(hash) % TONES.length] ?? TONES[0];
}

function glyphOf(teamspace: Pick<StorageTeamspace, "icon" | "private">) {
  const glyph: Glyph = known(teamspace.icon)
    ? SPACE_ICONS[teamspace.icon].icon
    : teamspace.private
      ? IconLockFilled
      : IconUsersFilled;
  return glyph;
}

function Tile(props: { id: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "-ms-0.5 -me-px -my-[1.5px] grid size-[18px] shrink-0 place-items-center rounded-lg",
        toneOf(props.id),
      )}
    >
      {props.children}
    </span>
  );
}

/**
 * A space's mark: its glyph, filled and white, on a tile in the space's own colour, so spaces
 * stand out from the grey folders around them. The tile is 18px with the large radius, a size up from
 * the row's 15px icons, and takes back the difference in negative margin: it still fills a 15px
 * slot and moves no label. The margin is 2px at the start and 1px at the end, not 1.5px each, so
 * the tile lands on whole pixels in a row and its glyph doesn't render half a pixel off. The 12px glyph sits centred, 3px from each
 * edge. The colour is picked from the space's id, so it stays the same everywhere and across
 * sessions. Its chosen glyph, or the default (also for a glyph this build doesn't know).
 */
export function SpaceIcon(props: { teamspace: Pick<StorageTeamspace, "id" | "icon" | "private"> }) {
  const Icon = glyphOf(props.teamspace);
  return (
    <Tile id={props.teamspace.id}>
      <Icon className="size-3 text-primary-foreground" />
    </Tile>
  );
}

const DEFAULT = "default";

/** Picks a space's sidebar glyph, its default first. */
export function SpaceIconDialog(props: { teamspace: StorageTeamspace; onClose: () => void }) {
  const { teamspace } = props;
  const update = useUpdateTeamspace();
  const [picked, setPicked] = useState<string>(known(teamspace.icon) ? teamspace.icon : DEFAULT);
  const save = () =>
    update.mutate(
      { id: teamspace.id, icon: picked === DEFAULT ? null : (picked as SpaceIconKey) },
      {
        onSuccess: props.onClose,
        onError: (error) => storageErrorToast(error, "The icon was not changed"),
      },
    );
  return (
    <Dialog size="sm" isOpen onOpenChange={(open) => !open && !update.isPending && props.onClose()}>
      <DialogHeader className="pe-0">
        <DialogTitle className="break-words">Icon for “{teamspace.name}”</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <ToggleGroup
          size="sq-md"
          aria-label="Icon"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[picked]}
          onSelectionChange={(keys) => {
            const [key] = [...keys];
            if (key !== undefined) setPicked(String(key));
          }}
          className="flex-wrap"
        >
          <ToggleGroupItem id={DEFAULT} aria-label="Default">
            <SpaceIcon teamspace={{ ...teamspace, icon: null }} />
          </ToggleGroupItem>
          {Object.entries(SPACE_ICONS).map(([key, { icon: Icon, label }]) => (
            <ToggleGroupItem key={key} id={key} aria-label={label}>
              <Tile id={teamspace.id}>
                <Icon className="size-3 text-primary-foreground" />
              </Tile>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </DialogBody>
      <DialogFooter>
        <DialogClose>Cancel</DialogClose>
        <Button isPending={update.isPending} onPress={save}>
          Save
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
