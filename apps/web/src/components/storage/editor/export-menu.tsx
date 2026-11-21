import type { ComponentType } from "react";
import {
  IconCopy,
  IconExport,
  IconFilePdf,
  IconFileText,
  IconMarkdown,
} from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSection, MenuTrigger } from "@/components/ui/menu";
import { appToast } from "@/components/ui/toast";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { useExportDoc, type DocExportAction } from "@/hooks/use-export-doc.ts";
import type { StorageNode } from "@/lib/storage.ts";
import { storageErrorToast } from "../storage-errors.ts";

const DOWNLOADS: { format: DocExportAction; label: string; icon: ComponentType }[] = [
  { format: "docx", label: "Word", icon: IconFileText },
  { format: "pdf", label: "PDF", icon: IconFilePdf },
  { format: "md", label: "Markdown", icon: IconMarkdown },
];

/**
 * A doc's Export, in its header: download it as Word, PDF or Markdown, or copy its Markdown.
 * Exports the doc as the editor holds it now (`text`), unsaved typing included.
 */
export function ExportMenu(props: { node: StorageNode; text: () => string | undefined }) {
  const exporting = useExportDoc();
  const run = (format: DocExportAction) =>
    exporting.mutate(
      { node: props.node, format, text: props.text() },
      {
        onSuccess: () => {
          if (format === "copy") appToast.success("Copied as Markdown");
        },
        onError: (error) => storageErrorToast(error, `“${props.node.name}” was not exported`),
      },
    );
  return (
    <MenuTrigger>
      <TooltipTrigger delay={400}>
        <Button intent="ghost" size="sq-sm" aria-label="Export" isPending={exporting.isPending}>
          <IconExport />
        </Button>
        <Tooltip>Export</Tooltip>
      </TooltipTrigger>
      <Menu aria-label="Export" placement="bottom end">
        <MenuSection label="Download">
          {DOWNLOADS.map((each) => (
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
        <MenuSection label="Copy">
          <MenuItem id="copy" textValue="Copy as Markdown" onAction={() => run("copy")}>
            <IconCopy data-slot="icon" />
            <MenuLabel>Copy as Markdown</MenuLabel>
          </MenuItem>
        </MenuSection>
      </Menu>
    </MenuTrigger>
  );
}
