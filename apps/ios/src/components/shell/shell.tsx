import { useEffect } from "react";
import { BottomBar } from "./bottom-bar.tsx";
import { useMenu } from "./menu-context.tsx";
import { MenuLayer } from "./menu-layer.tsx";
import { useMenuPlace } from "./menu-nav.ts";
import { TopBar } from "./top-bar.tsx";

/**
 * The shell's chrome over a module's root page: the menu, then the top and bottom bars over
 * both. A page pushed inside a module (a conversation, a folder) keeps its own native header.
 * A search is cleared here, only when the module changes: the bottom bar unmounts on a pushed
 * page, and a search must survive opening one of its results.
 */
export function ShellChrome() {
  const shell = useMenu();
  const { onRoot, module } = useMenuPlace();
  const { setQuery, setSearching } = shell;
  useEffect(() => {
    setQuery("");
    setSearching(false);
  }, [module, setQuery, setSearching]);
  if (!onRoot && !shell.isOpen) return null;
  return (
    <>
      <MenuLayer />
      <TopBar />
      <BottomBar />
    </>
  );
}
