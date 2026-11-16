// The closed sidebar's navigation (not on a phone): the module's places as icons on a small
// island at the window's start, fixed at the top, its top on the first group title of the page
// beside it ("Today"). Not a full-height rail: it is only as tall as its icons. Each icon is the
// sidebar's own row, collapsed (`SidebarItem`: a 32px square, its label as a tooltip, the current
// place on the accent fill); full-width lines divide the sections. No shadow: the border sets it
// on the canvas. Pages move over by the island's width (`var(--sidebar-island-width)`).
import { Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarContent } from "@/components/ui/sidebar";

/** The island's right edge, for the page beside it to start after: `var(--sidebar-island-width)`. */
const WIDTH_VAR = "--sidebar-island-width";

/** `sections`: each a group of `SidebarItem`s; a line runs between them. */
export function SidebarIsland({ sections }: { sections: ReactNode[] }) {
  const island = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = island.current;
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
    <nav
      ref={island}
      aria-label="Navigation"
      // 8px from the window's edge. 56px down: its top edge on the cap height of the list's first
      // date header (the 48px title row, then that header's text; measured).
      className="fixed start-2 top-14 z-10 rounded-xl border border-sidebar-border bg-sidebar"
    >
      {/* The sidebar's list, for its one hover highlight; 4px round the 32px icons. */}
      <SidebarContent className="flex-none gap-1 overflow-visible p-1">
        {sections.map((section, index) => (
          <Fragment key={index}>
            {/* Edge to edge, through the island's 4px padding. */}
            {index > 0 && <Separator className="-mx-1 w-auto self-stretch bg-sidebar-border" />}
            <div className="flex flex-col gap-y-0.5">{section}</div>
          </Fragment>
        ))}
      </SidebarContent>
    </nav>
  );
}
