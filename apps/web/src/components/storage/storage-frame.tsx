// The frame every Storage screen shares, on the mail lists' grid: a 48px header (the title or the
// breadcrumbs, then the screen's actions 10px from the right edge) over the content, which
// scrolls on its own.
import type { ReactNode } from "react";
import { IconSidebar } from "@/components/icons/sidebar";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export function StorageFrame(props: {
  /** The header's leading part: a heading, or breadcrumbs. */
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  // Collapsed, the sidebar's own toggle is gone with it: the header offers it instead.
  const sidebar = useSidebar();
  const sidebarHidden = sidebar.isMobile || !sidebar.open;
  return (
    <section className="relative flex h-svh min-h-0 min-w-0 flex-col">
      <header
        className={`flex h-12 shrink-0 items-center gap-2 border-b pe-2.5 ${sidebarHidden ? "ps-2.5" : "ps-5"}`}
      >
        {sidebarHidden && (
          <SidebarTrigger intent="ghost" size="sq-sm" aria-label="Open sidebar">
            <IconSidebar />
          </SidebarTrigger>
        )}
        <div className="flex min-w-0 flex-1 items-center">{props.title}</div>
        {props.actions && <div className="flex shrink-0 items-center gap-1.5">{props.actions}</div>}
      </header>
      {props.children}
    </section>
  );
}
