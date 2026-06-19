"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import type { ResolvedLink, ResolvedRow } from "@/lib/types";

interface LinkedCellProps {
  rowId: number;
  linkColumnId: number;
  targetTableId: number;
  targetTableName: string;
  links: ResolvedLink[];
  /** All rows in the target table (for the picker). */
  targetRows: ResolvedRow[];
  onUpdate: () => void;
}

export function LinkedCell({
  rowId,
  linkColumnId,
  targetTableName,
  links,
  targetRows,
  onUpdate,
}: LinkedCellProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const linkedIds = new Set(links.map((l) => l.targetRowId));

  const filtered = targetRows.filter((r) =>
    r.label.toLowerCase().includes(query.toLowerCase())
  );

  async function addLink(targetRowId: number) {
    try {
      await api.addLink(linkColumnId, rowId, targetRowId);
      onUpdate();
    } catch (err) {
      console.error("Failed to add link:", err);
    }
  }

  async function removeLink(targetRowId: number) {
    try {
      await api.removeLinkByEnds(linkColumnId, rowId, targetRowId);
      onUpdate();
    } catch (err) {
      console.error("Failed to remove link:", err);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <div
        onClick={() => setOpen(true)}
        className="w-full h-full px-2 py-1.5 flex flex-wrap gap-1 items-center cursor-pointer min-h-[36px]"
      >
        {links.length === 0 ? (
          <span className="text-muted-foreground text-sm px-1">+ Add link</span>
        ) : (
          links.map((l) => (
            <span
              key={l.linkId}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-medium group/chip"
            >
              {l.targetLabel}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeLink(l.targetRowId);
                }}
                className="opacity-50 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${targetTableName}...`}
                className="flex-1 bg-transparent border-none outline-none text-sm text-foreground"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
            )}
            {filtered.map((r) => {
              const isLinked = linkedIds.has(r.row.id);
              return (
                <button
                  key={r.row.id}
                  type="button"
                  onClick={() => {
                    if (isLinked) {
                      removeLink(r.row.id);
                    } else {
                      addLink(r.row.id);
                    }
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-accent ${
                    isLinked ? "text-primary" : "text-foreground"
                  }`}
                >
                  <span className="truncate">{r.label}</span>
                  {isLinked && <X className="h-3 w-3 shrink-0" />}
                  {!isLinked && <Plus className="h-3 w-3 shrink-0 opacity-50" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Fetch all rows for a target table (used by the grid to populate link pickers).
 * Cached per table id for the lifetime of the grid.
 */
const targetRowsCache = new Map<number, ResolvedRow[]>();

export async function getTargetRows(tableId: number): Promise<ResolvedRow[]> {
  const cached = targetRowsCache.get(tableId);
  if (cached) return cached;
  const data = await api.getTableData(tableId);
  if (!data) return [];
  targetRowsCache.set(tableId, data.rows);
  return data.rows;
}

/** Invalidate the cache for a table (call after mutations). */
export function invalidateTargetRowsCache(tableId?: number): void {
  if (tableId !== undefined) {
    targetRowsCache.delete(tableId);
  } else {
    targetRowsCache.clear();
  }
}
