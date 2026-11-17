import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { defaultFilter } from "cmdk";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconArchive,
  IconCheck,
  IconCircleCheck,
  IconClockSnooze,
  IconFileText,
  IconFolder,
  IconKeyboard,
  IconMailOpen,
  IconNote,
  IconReply,
  IconRestore,
  IconUserAdd,
  IconX,
} from "@/components/icons/central";
import {
  IconBubble,
  IconBubbleAnnotation,
  IconClock,
  IconEmail,
  IconInbox,
  IconSearch,
  IconSettings,
  IconWrite,
} from "@/components/icons/sidebar";
import { useListSweep } from "@/components/inbox/list-sweep";
import {
  Command,
  CommandDialog,
  CommandDetail,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Loader } from "@/components/ui/loader";
import { useThreads } from "@/hooks/use-mail.ts";
import { runShortcut, useAvailableShortcuts, useShortcut } from "@/hooks/use-shortcuts.ts";
import { searchQuery } from "@/lib/mail-queries.ts";
import { COMMAND_IDS, keyLabel, SHORTCUTS, type ShortcutId } from "@/lib/shortcuts.ts";
import { senderLabel } from "@/lib/threads.ts";
import { useWorkspaceSlug } from "@/hooks/use-workspaces.ts";
import { workspaceHref } from "@/lib/workspaces.ts";

// The command menu: a centred cmdk modal over the dimmed app (transitive's workspace search as
// the reference). "/" or ⌘K opens it from anywhere in a workspace; ⌘K closes it again. Typing
// filters pages, commands and inbox threads in the browser; "Smart search" asks the server and
// shows its results in the main list, at `/<workspace>/mail/search?q=`.

/** What search opens holding: the words already searched, and the mailbox they were scoped to. */
export interface SearchSeed {
  q: string;
  mailbox?: string | undefined;
}
/** The mounted menu's opener; set while it is (the workspace shell mounts one). */
let openMounted: ((seed?: SearchSeed) => void) | undefined;
/**
 * Opens the menu from a control elsewhere (the list's search field), as `/` does; with a `seed`,
 * to edit that search (an empty result's Edit search).
 */
export const openSearch = (seed?: SearchSeed) => openMounted?.(seed);

interface Page {
  id: string;
  title: string;
  icon: ReactNode;
  href: string;
  /** The go-to keys that open it, shown on the row and run instead of `href`. */
  shortcut?: ShortcutId;
}

const PAGES: Page[] = [
  { id: "inbox", title: "Inbox", icon: <IconInbox />, href: "/mail/inbox", shortcut: "goInbox" },
  {
    id: "needs-reply",
    title: "Needs reply",
    icon: <IconBubble />,
    href: "/mail/inbox?lane=needs_reply",
  },
  {
    id: "awaiting-reply",
    title: "Awaiting reply",
    icon: <IconBubbleAnnotation />,
    href: "/mail/inbox?lane=waiting_on_them",
  },
  { id: "later", title: "Later", icon: <IconClock />, href: "/mail/later", shortcut: "goLater" },
  { id: "all", title: "All mail", icon: <IconEmail />, href: "/mail/all", shortcut: "goAll" },
  { id: "drive", title: "Drive", icon: <IconFolder />, href: "/files/my", shortcut: "goDrive" },
  { id: "settings", title: "Settings", icon: <IconSettings />, href: "/settings" },
];

// Every command row leads with an icon (DESIGN.md, Menus). Go-to keys are pages above.
const COMMAND_ICONS: Partial<Record<ShortcutId, ReactNode>> = {
  compose: <IconWrite />,
  reply: <IconReply />,
  note: <IconNote />,
  done: <IconCheck />,
  later: <IconArchive />,
  read: <IconMailOpen />,
  close: <IconX />,
  assignToMe: <IconUserAdd />,
  resolve: <IconCircleCheck />,
  snooze: <IconClockSnooze />,
  cannedReply: <IconFileText />,
  undo: <IconRestore />,
  help: <IconKeyboard />,
};
const COMMANDS = COMMAND_IDS.filter((id) => id in COMMAND_ICONS);

const FOOTER = [
  { keys: "↑↓", label: "Navigate" },
  { keys: "↵", label: "Open" },
  { keys: "Esc", label: "Close" },
];

/** A shortcut's first key sequence as key caps: `G` `I`, or `⌘` `K`. */
const keysOf = (id: ShortcutId) => (SHORTCUTS[id].keys[0] ?? []).flatMap(keyLabel);

// Rows match on their keywords (title, sender), not on their value, which is just a unique id.
// Smart search always matches: it searches the server for whatever was typed.
const SMART = "smart-search";
const filter = (value: string, search: string, keywords?: string[]) =>
  value === SMART ? 1 : defaultFilter("", search, keywords);

/** Mounted once by the workspace shell: binds `/` and ⌘K and renders the menu. */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<SearchSeed | undefined>();
  const show = (next?: SearchSeed) => {
    setSeed(next);
    setOpen(true);
  };
  useShortcut("search", () => show());
  useShortcut("commandMenu", () => (open ? setOpen(false) : show()));
  useEffect(() => {
    openMounted = show;
    return () => {
      if (openMounted === show) openMounted = undefined;
    };
  });

  return (
    <CommandDialog label="Search and commands" isOpen={open} onOpenChange={setOpen}>
      <MenuPanel seed={seed} onClose={() => setOpen(false)} />
    </CommandDialog>
  );
}

/** The menu's content, mounted only while the menu is (so each opening starts fresh). */
function MenuPanel({ seed, onClose }: { seed?: SearchSeed | undefined; onClose: () => void }) {
  const navigate = useNavigate();
  const workspace = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sweepList = useListSweep();
  const available = useAvailableShortcuts();
  const { threads } = useThreads({ view: "inbox" });
  const [q, setQ] = useState(seed?.q ?? "");
  const mailbox = seed?.mailbox;
  const [searching, setSearching] = useState(false);
  const query = q.trim();

  // A command runs once the menu is gone: run now, the closing modal would take focus back from
  // whatever the command focuses (the reply composer).
  const afterClose = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      afterClose.current?.();
      afterClose.current = null;
    },
    [],
  );
  const runCommand = (id: ShortcutId) => {
    afterClose.current = () => runShortcut(id);
    onClose();
  };
  const openPage = (page: Page) => {
    onClose();
    if (page.shortcut && runShortcut(page.shortcut)) return;
    void router.navigate({ href: workspaceHref(workspace, page.href) });
  };

  // Loads the results first, so the sweep reveals a full list rather than a loading one.
  const smartSearch = async () => {
    if (!query || searching) return;
    setSearching(true);
    try {
      await queryClient.fetchQuery(searchQuery(query, mailbox));
    } finally {
      setSearching(false);
    }
    onClose();
    sweepList(() =>
      navigate({
        to: "/$workspace/mail/search",
        params: { workspace },
        search: { q: query, mailbox },
      }),
    );
  };

  // No vim keys: cmdk would take Ctrl+K (previous row), which closes the menu off a Mac.
  return (
    <Command label="Search and commands" loop filter={filter} vimBindings={false}>
      <CommandInput
        autoFocus
        value={q}
        onValueChange={setQ}
        placeholder="Search mail and commands…"
      />
      <CommandList>
        {query && (
          <CommandGroup>
            <CommandItem value={SMART} onSelect={() => void smartSearch()}>
              {searching ? <Loader /> : <IconSearch />}
              <span className={`min-w-0 truncate ${searching ? "shimmer" : ""}`}>
                Smart search for “{query}”
              </span>
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {PAGES.map((page) => (
            <CommandItem
              key={page.id}
              value={`page:${page.id}`}
              keywords={[page.title]}
              onSelect={() => openPage(page)}
            >
              {page.icon}
              <span className="min-w-0 truncate">{page.title}</span>
              {page.shortcut && <CommandShortcut keys={keysOf(page.shortcut)} />}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Commands">
          {COMMANDS.filter((id) => available.has(id)).map((id) => (
            <CommandItem
              key={id}
              value={`command:${id}`}
              keywords={[SHORTCUTS[id].label]}
              onSelect={() => runCommand(id)}
            >
              {COMMAND_ICONS[id]}
              <span className="min-w-0 truncate">{SHORTCUTS[id].label}</span>
              <CommandShortcut keys={keysOf(id)} />
            </CommandItem>
          ))}
        </CommandGroup>
        {/* Threads only once there's something to match them against. */}
        {query && (
          <CommandGroup heading="Threads">
            {threads.map((thread) => {
              const sender = senderLabel(thread);
              return (
                <CommandItem
                  key={thread.id}
                  value={`thread:${thread.id}`}
                  keywords={[thread.subject, sender]}
                  onSelect={() => {
                    onClose();
                    void navigate({
                      to: "/$workspace/mail/inbox/$threadId",
                      params: { workspace, threadId: thread.id },
                    });
                  }}
                >
                  <IconEmail />
                  <span className="min-w-0 truncate">{thread.subject || "(no subject)"}</span>
                  <CommandDetail>{sender}</CommandDetail>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
      <CommandFooter hints={FOOTER} />
    </Command>
  );
}
