import { IconExport, IconUserAdd } from "@/components/icons/central";
import type { SettingsRowMenuItem } from "@/components/settings/kit/settings-row-menu";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSection, MenuTrigger } from "@/components/ui/menu";
import type { StorageNode } from "@/lib/storage.ts";
import { DOC_EXPORTS, useDocExport } from "./export-menu.tsx";

/**
 * A doc's second bar, under its header: Export (Word, PDF, Markdown, or its Markdown copied, as
 * the editor holds it now) and Share. Absent for anything but a doc being edited.
 */
export function DocBar(props: {
  node: StorageNode;
  items: SettingsRowMenuItem[];
  text: (() => string | undefined) | undefined;
  /** Side by side with the folder: the line between them runs down its edge too. */
  border: boolean;
}) {
  const { text } = props;
  if (!text) return null;
  return <Bar node={props.node} items={props.items} text={text} border={props.border} />;
}

function Bar(props: {
  node: StorageNode;
  items: SettingsRowMenuItem[];
  text: () => string | undefined;
  border: boolean;
}) {
  const run = useDocExport(props.node, props.text);
  const share = props.items.find((item) => item.label === "Share");
  const downloads = DOC_EXPORTS.filter((each) => each.format !== "copy");
  const copy = DOC_EXPORTS.filter((each) => each.format === "copy");
  return (
    <div
      className={`flex h-11 shrink-0 items-center justify-end gap-1 border-b bg-background px-2.5 ${props.border ? "border-s" : ""}`}
    >
      <MenuTrigger>
        <Button intent="plain" size="sm">
          <IconExport data-slot="icon" />
          Export
        </Button>
        <Menu aria-label="Export" placement="bottom end">
          {[
            { label: "Download", rows: downloads },
            { label: "Copy", rows: copy },
          ].map((section) => (
            <MenuSection key={section.label} label={section.label}>
              {section.rows.map((each) => (
                <MenuItem
                  key={each.format}
                  id={each.format}
                  textValue={each.label}
                  onAction={() => run(each.format)}
                >
                  <each.icon data-slot="icon" />
                  <MenuLabel>{each.label}</MenuLabel>
                </MenuItem>
              ))}
            </MenuSection>
          ))}
        </Menu>
      </MenuTrigger>
      {share && (
        <Button intent="plain" size="sm" onPress={share.onAction}>
          <IconUserAdd data-slot="icon" />
          Share
        </Button>
      )}
    </div>
  );
}
