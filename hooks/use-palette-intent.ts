"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The ⌘K palette's way of launching a flow that lives on another page.
 *
 * The palette never rebuilds a create sheet or wizard — those are wired to
 * their page's data. Instead it navigates with `?action=<name>` and the page
 * component that owns the sheet opens it on arrival. The parameter is stripped
 * from the URL straight away so a reload or a shared link does not reopen the
 * sheet.
 */
export const PALETTE_ACTION_PARAM = "action";
/** `?q=` — pre-fills a list page's search box ("See all results in Members"). */
export const PALETTE_QUERY_PARAM = "q";

export function paletteHref(
  pathname: string,
  params: { action?: string; q?: string },
) {
  const search = new URLSearchParams();
  if (params.action) search.set(PALETTE_ACTION_PARAM, params.action);
  if (params.q) search.set(PALETTE_QUERY_PARAM, params.q);
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Runs `onAction` once when the page was reached with `?action=<name>`, then
 * removes the parameter. The initial `?q=` is returned for the search box.
 */
export function usePaletteIntent(
  name: string,
  onAction: () => void,
): { initialSearch: string } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handled = useRef(false);
  const initialSearch = useRef(searchParams.get(PALETTE_QUERY_PARAM) ?? "");

  const action = searchParams.get(PALETTE_ACTION_PARAM);

  useEffect(() => {
    if (action !== name || handled.current) return;
    handled.current = true;
    onAction();

    const next = new URLSearchParams(searchParams.toString());
    next.delete(PALETTE_ACTION_PARAM);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // `onAction` is a state setter or a stable callback; re-running on its
    // identity would reopen the sheet after every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, name, pathname, router, searchParams]);

  return { initialSearch: initialSearch.current };
}
