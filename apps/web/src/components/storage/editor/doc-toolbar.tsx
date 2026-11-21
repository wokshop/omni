import { useEditorState, type Editor } from "@tiptap/react";
import { cn } from "cn";
import type { ComponentType, ReactNode } from "react";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCommentPlain,
  IconEllipsis,
  IconRows,
  IconTable,
  IconTextSize,
  IconTrash,
} from "@/components/icons/central";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSection, MenuTrigger } from "@/components/ui/menu";
import { popupSurface } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { block, type BlockKind } from "./blocks.ts";

const STYLES = ["text", "h1", "h2", "h3"].map(block);
const LISTS = ["bullets", "numbers", "todo"].map(block);
const MORE = ["quote", "code", "divider"].map(block);

const LIST_NODE: Record<string, string> = {
  bullets: "bulletList",
  numbers: "orderedList",
  todo: "taskList",
};

function styleOf(editor: Editor) {
  for (const level of [1, 2, 3]) if (editor.isActive("heading", { level })) return `h${level}`;
  return "text";
}

function useToolbarState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: styleOf(e),
      list: LISTS.find((each) => e.isActive(LIST_NODE[each.id]!))?.id ?? null,
      table: e.isActive("table"),
      empty: e.state.selection.empty,
    }),
  });
}

function Tool(props: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  isPressed?: boolean;
  isDisabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <TooltipTrigger delay={400}>
      <Button
        intent={props.isPressed ? "secondary" : "plain"}
        size="sq-sm"
        aria-label={props.label}
        aria-pressed={props.isPressed}
        isDisabled={props.isDisabled}
        onPress={props.onPress}
      >
        <props.icon />
      </Button>
      <Tooltip>{props.label}</Tooltip>
    </TooltipTrigger>
  );
}

function ToolMenu(props: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  isPressed?: boolean;
  children: ReactNode;
  selected?: string;
}) {
  return (
    <MenuTrigger>
      <Button
        intent={props.isPressed ? "secondary" : "plain"}
        size="sq-sm"
        aria-label={props.label}
      >
        <props.icon />
      </Button>
      <Menu
        aria-label={props.label}
        placement="top"
        selectionMode={props.selected ? "single" : "none"}
        selectedKeys={props.selected ? [props.selected] : undefined}
      >
        {props.children}
      </Menu>
    </MenuTrigger>
  );
}

function BlockItem(props: { editor: Editor; kind: BlockKind }) {
  const { kind } = props;
  return (
    <MenuItem id={kind.id} textValue={kind.label} onAction={() => kind.run(props.editor)}>
      <kind.icon data-slot="icon" />
      <MenuLabel>{kind.label}</MenuLabel>
    </MenuItem>
  );
}

function Item(props: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
  onAction: () => void;
}) {
  return (
    <MenuItem
      id={props.label}
      textValue={props.label}
      intent={props.danger ? "danger" : undefined}
      onAction={props.onAction}
    >
      <props.icon data-slot="icon" />
      <MenuLabel>{props.label}</MenuLabel>
    </MenuItem>
  );
}

function TableMenu(props: { editor: Editor }) {
  const run = (change: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () =>
    change(props.editor.chain().focus()).run();
  return (
    <ToolMenu label="Table" icon={IconTable} isPressed>
      <MenuSection label="Rows">
        <Item label="Add row above" icon={IconArrowUp} onAction={run((c) => c.addRowBefore())} />
        <Item label="Add row below" icon={IconArrowDown} onAction={run((c) => c.addRowAfter())} />
        <Item label="Delete row" icon={IconTrash} onAction={run((c) => c.deleteRow())} />
      </MenuSection>
      <MenuSection label="Columns">
        <Item
          label="Add column left"
          icon={IconArrowLeft}
          onAction={run((c) => c.addColumnBefore())}
        />
        <Item
          label="Add column right"
          icon={IconArrowRight}
          onAction={run((c) => c.addColumnAfter())}
        />
        <Item label="Delete column" icon={IconTrash} onAction={run((c) => c.deleteColumn())} />
      </MenuSection>
      <MenuSection label="Table">
        <Item label="Header row" icon={IconRows} onAction={run((c) => c.toggleHeaderRow())} />
        <Item label="Delete table" icon={IconTrash} danger onAction={run((c) => c.deleteTable())} />
      </MenuSection>
    </ToolMenu>
  );
}

/**
 * The doc's toolbar, floating at the bottom of the page: the text style, lists, a table, an
 * image, a dropdown, the rarer blocks, and a comment on the selected text.
 */
export function DocToolbar(props: { editor: Editor; onComment?: (() => void) | undefined }) {
  const { editor } = props;
  const state = useToolbarState(editor);
  const style = STYLES.find((each) => each.id === state.style) ?? STYLES[0]!;
  if (!editor.isEditable) return null;
  return (
    <div
      role="toolbar"
      aria-label="Format"
      aria-orientation="horizontal"
      className={cn(
        popupSurface,
        "sticky bottom-4 mx-auto mb-4 flex w-fit max-w-[calc(100%-2rem)] items-center gap-0.5 overflow-x-auto p-1",
      )}
    >
      <ToolMenu label={`Text style: ${style.label}`} icon={IconTextSize} selected={style.id}>
        {STYLES.map((kind) => (
          <BlockItem key={kind.id} editor={editor} kind={kind} />
        ))}
      </ToolMenu>
      <Separator orientation="vertical" className="mx-0.5 h-4 self-center" />
      {LISTS.map((kind) => (
        <Tool
          key={kind.id}
          label={kind.label}
          icon={kind.icon}
          isPressed={state.list === kind.id}
          onPress={() => kind.run(editor)}
        />
      ))}
      {state.table ? (
        <TableMenu editor={editor} />
      ) : (
        <Tool label="Table" icon={IconTable} onPress={() => block("table").run(editor)} />
      )}
      <Tool label="Image" icon={block("image").icon} onPress={() => block("image").run(editor)} />
      <Tool
        label="Dropdown"
        icon={block("dropdown").icon}
        onPress={() => block("dropdown").run(editor)}
      />
      <ToolMenu label="More blocks" icon={IconEllipsis}>
        {MORE.map((kind) => (
          <BlockItem key={kind.id} editor={editor} kind={kind} />
        ))}
      </ToolMenu>
      {props.onComment && (
        <>
          <Separator orientation="vertical" className="mx-0.5 h-4 self-center" />
          <Tool
            label="Comment"
            icon={IconCommentPlain}
            isDisabled={state.empty}
            onPress={props.onComment}
          />
        </>
      )}
    </div>
  );
}
