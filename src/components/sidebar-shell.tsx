"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;
const STORAGE_KEY = "sidebar-width";
const COLLAPSED_KEY = "sidebar-collapsed";

interface SidebarShellProps {
  children: React.ReactNode;
}

export function SidebarShell({ children }: SidebarShellProps) {
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const storedWidth = localStorage.getItem(STORAGE_KEY);
    if (storedWidth) {
      const parsed = Number(storedWidth);
      if (!Number.isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        setWidth(parsed);
      }
    }
    const storedCollapsed = localStorage.getItem(COLLAPSED_KEY);
    if (storedCollapsed === "true") setCollapsed(true);
  }, []);

  const persistWidth = useCallback((w: number) => {
    localStorage.setItem(STORAGE_KEY, String(w));
  }, []);

  const persistCollapsed = useCallback((c: boolean) => {
    localStorage.setItem(COLLAPSED_KEY, String(c));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (collapsed) return;
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [collapsed, width]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing) return;
      const delta = e.clientX - startXRef.current;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidthRef.current + delta)
      );
      setWidth(next);
    },
    [isResizing]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing) return;
      setIsResizing(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      persistWidth(width);
    },
    [isResizing, persistWidth, width]
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }, [persistCollapsed]);

  return (
    <div
      className="relative flex h-full shrink-0"
      style={{ width: collapsed ? 0 : width }}
    >
      {!collapsed && (
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      )}

      {/* Collapse / expand toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-3 z-20 h-6 w-6 rounded-full border border-border bg-background shadow-sm"
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* Resize handle */}
      {!collapsed && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`absolute -right-1 top-0 h-full w-1 cursor-col-resize touch-none select-none transition-colors ${
            isResizing
              ? "bg-primary/40"
              : "bg-transparent hover:bg-primary/20"
          }`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
      )}
    </div>
  );
}
