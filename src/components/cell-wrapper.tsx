"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

/**
 * Uniform-height cell wrapper.
 *
 * The cell content is clipped to a fixed row height. When the inner content
 * overflows, clicking the cell opens a plain centered popup showing the full,
 * untruncated content (scrollable inside). No headings, padding, borders, or
 * backdrop blur — just the content.
 *
 * Only ONE popup is open at a time across the whole grid: opening a new one
 * closes any previously-open one.
 *
 * When content does NOT overflow, clicking the cell behaves normally (e.g.
 * opens the inline editor), because the children handle their own clicks.
 *
 * The cell only grows taller than the default row height when an editor
 * inside is focused (an explicit user action).
 */
const DEFAULT_ROW_HEIGHT = 36; // px

// --- Singleton: ensures only one cell popup is open at a time ---------------
// A module-level subscription store. When a cell opens its popup, it calls
// `openPopup(id)`. Every subscribed cell is notified; the one whose id matches
// becomes open, all others close.
type Listener = (openId: number | null) => void;
let currentOpenId: number | null = null;
const listeners = new Set<Listener>();

function openPopup(id: number) {
  currentOpenId = id;
  for (const l of listeners) l(currentOpenId);
}
function closePopup(id: number) {
  if (currentOpenId === id) {
    currentOpenId = null;
    for (const l of listeners) l(currentOpenId);
  }
}
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Monotonic id generator for cell instances.
let nextId = 1;

interface CellWrapperProps {
  children: ReactNode;
  /** Expanded content shown in the popup. Defaults to children. */
  expandedContent?: ReactNode;
  /** Title for accessibility (not rendered visibly). */
  label?: string;
  /** Fixed height for the cell body (px). */
  height?: number;
  className?: string;
  /** Whether to enable the expand popup. Defaults to true. */
  enableExpand?: boolean;
}

export function CellWrapper({
  children,
  expandedContent,
  label,
  height = DEFAULT_ROW_HEIGHT,
  className,
  enableExpand = true,
}: CellWrapperProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [editing, setEditing] = useState(false);
  // This cell's unique id, stable across renders.
  const idRef = useRef<number>(nextId++);
  // Whether THIS cell's popup is the currently-open one.
  const [isOpen, setIsOpen] = useState(false);

  // Subscribe to the singleton store. When the global open id changes, update
  // local state accordingly.
  useEffect(() => {
    return subscribe((openId) => {
      setIsOpen(openId === idRef.current);
    });
  }, []);

  // Detect whether the content overflows the fixed cell box. We check both
  // the wrapper itself AND all descendants, because read views use `truncate`
  // (overflow:hidden on the child) which clips at the child level and hides
  // the overflow from the parent's scrollWidth/scrollHeight.
  useEffect(() => {
    if (editing) {
      setOverflows(false);
      return;
    }
    const el = innerRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const check = () => {
      let overflows =
        el.scrollHeight > height + 1 ||
        el.scrollWidth > el.clientWidth + 1;
      if (!overflows) {
        const descendants = el.querySelectorAll("*");
        for (const d of Array.from(descendants)) {
          if (d.scrollWidth > d.clientWidth + 1) {
            overflows = true;
            break;
          }
          if (d.clientHeight > 0 && d.scrollHeight > d.clientHeight + 1) {
            overflows = true;
            break;
          }
        }
      }
      setOverflows(overflows);
    };
    // Defer first check until after layout/fonts settle.
    const raf = requestAnimationFrame(check);
    // Observe the wrapper (its size changes with column resize / reflow);
    // the inner is absolute + fixed-height so it never triggers RO.
    const ro = new ResizeObserver(check);
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [height, children, editing]);

  // Track whether an editor (input/textarea/select) inside is focused.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const node: HTMLElement = wrap;
    function onFocusIn(e: FocusEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      ) {
        setEditing(true);
      }
    }
    function onFocusOut(e: FocusEvent) {
      const t = e.relatedTarget as HTMLElement | null;
      if (!t || !node.contains(t)) {
        setEditing(false);
      }
    }
    node.addEventListener("focusin", onFocusIn);
    node.addEventListener("focusout", onFocusOut);
    return () => {
      node.removeEventListener("focusin", onFocusIn);
      node.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // When content overflows, a click anywhere on the cell opens the popup
  // (instead of letting the children's onClick start the inline editor).
  const useDialogClick = enableExpand && !editing && overflows;

  // Cleanup: if this cell unmounts while its popup is open, clear the global
  // slot so the store doesn't reference a dead id.
  useEffect(() => {
    return () => {
      closePopup(idRef.current);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full", className)}
      style={editing ? { minHeight: height } : { height }}
    >
      {editing ? (
        <div ref={innerRef} className="w-full">
          {children}
        </div>
      ) : (
        <div
          ref={innerRef}
          className="absolute top-0 left-0 right-0 overflow-hidden"
          style={{ height }}
        >
          {children}
        </div>
      )}

      {/* Click overlay — when content overflows, the whole cell opens the popup */}
      {useDialogClick && (
        <button
          type="button"
          aria-label="Expand cell content"
          onClick={(e) => {
            e.stopPropagation();
            openPopup(idRef.current);
          }}
          className="absolute inset-0 z-30 w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      )}

      {/* Plain popup — no overlay/blur, no padding, no borders, no headings.
          Just the content, centered, scrollable. Click outside to close. */}
      <DialogPrimitive.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) openPopup(idRef.current);
          else closePopup(idRef.current);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Popup
            data-slot="dialog-content"
            className={cn(
              "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
              "max-w-[80vw] max-h-[80vh] overflow-auto",
              "bg-popover text-popover-foreground text-sm",
              "outline-none duration-100",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            )}
          >
            <div className="whitespace-pre-wrap break-words p-4">
              {expandedContent ?? children}
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
