"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])";

/**
 * Modal dialog keyboard behaviour: focus moves into the dialog, Tab stays inside it,
 * Escape closes it, and focus returns to where it was when the dialog closes.
 * Runs once per dialog; the latest close handler is read from a ref, so parent
 * re-renders (for example a new notice) never move the user's focus.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [ref]);
}
