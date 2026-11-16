// The desktop app's title-bar group (docs/spec/desktop.md, "Navigation changes in the web app"):
// the sidebar toggle beside the macOS traffic lights, then notifications (as an inbox) and the
// workspace switcher as its mark, on the window's top 48px row. With the sidebar open the last two
// sit at the sidebar's end, the mark on the rows' trailing axis, and the sidebar's own rows start
// under this row. With it closed all three follow the traffic lights and page headers leave room
// for them. Back and forward are keys only (⌘[ ⌘]). Not in Figma: built
// from the sidebar's own switcher and bell and the page headers' 28px ghost buttons, nothing
// added. The rest of the row moves the window (`routeTitleBarDrags`). Not drawn in a browser.
import { useLayoutEffect, useRef } from "react";
import { IconSidebar } from "@/components/icons/sidebar";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { desktop } from "@/lib/desktop.ts";
import { WorkspaceSwitcher } from "./module-switcher";
import { NotificationsButton } from "./notifications";

/** The group's width, for the rows it sits over to leave room: `var(--title-bar-width)`. */
const WIDTH_VAR = "--title-bar-width";

export function DesktopTitleBar() {
  const sidebar = useSidebar();
  const open = sidebar.isMobile ? sidebar.isOpenOnMobile : sidebar.open;
  const group = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = group.current;
    if (!element) return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() =>
      root.setProperty(WIDTH_VAR, `${element.getBoundingClientRect().right}px`),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.removeProperty(WIDTH_VAR);
    };
  }, []);

  return (
    <div
      ref={group}
      // The sidebar toggle right after the traffic lights (macOS keeps them in the first 76px, on
      // this row's centre line; elsewhere the row starts 8px in, as the sidebar's rows do).
      // Open: as wide as the sidebar, notifications and the workspace at its end, the mark centred
      // on the rows' trailing axis (the chevrons and counts, 21.5px in from the sidebar's edge).
      className={`fixed start-0 top-0 z-20 flex h-12 items-center gap-0.5 ${desktop.platform === "mac" ? "ps-19" : "ps-2"} ${open ? "w-(--sidebar-width) pe-[7.5px]" : "pe-1"}`}
    >
      <SidebarTrigger
        intent="ghost"
        size="sq-sm"
        aria-label={open ? "Close sidebar" : "Open sidebar"}
      >
        <IconSidebar />
      </SidebarTrigger>
      <span className={open ? "ms-auto flex items-center gap-0.5" : "flex items-center gap-0.5"}>
        <NotificationsButton />
        <WorkspaceSwitcher iconOnly />
      </span>
    </div>
  );
}

/** The sidebar's first row in the desktop app: the title bar's, so its own rows start under it. */
export function TitleBarRow() {
  return desktop.isDesktop ? <div aria-hidden className="h-8 shrink-0" /> : null;
}

/**
 * Room for the title-bar group in a page header while the sidebar is closed. `inset` is how far in from the window's edge the row's content
 * starts, which the group already covers.
 */
export function TitleBarSpace({ inset }: { inset: number }) {
  return (
    <div
      aria-hidden
      className="shrink-0 self-stretch"
      style={{ width: `calc(var(${WIDTH_VAR}, 0px) - ${inset}px)` }}
    />
  );
}
