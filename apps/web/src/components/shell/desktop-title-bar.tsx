// The desktop app's title-bar group (docs/spec/desktop.md, "Navigation changes in the web app"):
// back and forward through the app's history, and the sidebar toggle, on the window's top 48px
// row, whose start is the macOS traffic lights'. With the sidebar open the group ends where the
// sidebar's rows do, so the toggle sits over the bell and the rows' trailing icons, and the
// sidebar's own rows start under this row. With it closed the group follows the traffic lights
// and page headers leave room for it. Not in Figma: built from the page headers' 28px ghost
// buttons, nothing added. The rest of the row moves the window (`routeTitleBarDrags`). Not drawn
// in a browser.
import { useRouter } from "@tanstack/react-router";
import { useLayoutEffect, useRef } from "react";
import { IconChevronLeft, IconChevronRight } from "@/components/icons/central";
import { IconSidebar } from "@/components/icons/sidebar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useHistoryEnds } from "@/hooks/use-history-ends.ts";
import { desktop } from "@/lib/desktop.ts";
import { ariaKeyShortcuts } from "@/lib/shortcuts.ts";

/** The group's width, for the rows it sits over to leave room: `var(--title-bar-width)`. */
const WIDTH_VAR = "--title-bar-width";

export function DesktopTitleBar() {
  const { history } = useRouter();
  const ends = useHistoryEnds();
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
      // Open: as wide as the sidebar, ending 9px in (its 1px border and the rows' 8px padding).
      // Closed: macOS keeps its traffic lights in the first 76px, on this row's centre line (the
      // shell places them); elsewhere the group starts 8px in, as the sidebar's rows do.
      className={
        open
          ? "fixed start-0 top-0 z-20 flex h-12 w-(--sidebar-width) items-center justify-end gap-0.5 pe-[9px]"
          : `fixed start-0 top-0 z-20 flex h-12 items-center gap-0.5 pe-1 ${desktop.platform === "mac" ? "ps-19" : "ps-2"}`
      }
    >
      <Button
        intent="ghost"
        size="sq-sm"
        aria-label="Back"
        aria-keyshortcuts={ariaKeyShortcuts("back")}
        isDisabled={!ends.back}
        onPress={() => history.back()}
      >
        <IconChevronLeft />
      </Button>
      <Button
        intent="ghost"
        size="sq-sm"
        aria-label="Forward"
        aria-keyshortcuts={ariaKeyShortcuts("forward")}
        isDisabled={!ends.forward}
        onPress={() => history.forward()}
      >
        <IconChevronRight />
      </Button>
      <SidebarTrigger
        intent="ghost"
        size="sq-sm"
        aria-label={open ? "Close sidebar" : "Open sidebar"}
      >
        <IconSidebar />
      </SidebarTrigger>
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
