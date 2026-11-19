import { BottomBar } from "./bottom-bar.tsx";
import { useMenu } from "./menu-context.tsx";
import { MenuLayer } from "./menu-layer.tsx";
import { useMenuPlace } from "./menu-nav.ts";
import { TopBar } from "./top-bar.tsx";

/**
 * The shell's chrome over a module's root page: the menu, then the top and bottom bars over
 * both. A page pushed inside a module (a conversation, a folder) keeps its own native header.
 */
export function ShellChrome() {
  const shell = useMenu();
  const { onRoot } = useMenuPlace();
  if (!onRoot && !shell.isOpen) return null;
  return (
    <>
      <MenuLayer />
      <TopBar />
      <BottomBar />
    </>
  );
}
