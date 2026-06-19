"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { EditableCell, CheckboxCell } from "@/components/editable-cell";
import { LinkedCell, getTargetRows, invalidateTargetRowsCache } from "@/components/linked-cell";
import { CellWrapper } from "@/components/cell-wrapper";
import type {
  TableData,
  ColumnType,
  ResolvedColumn,
  ResolvedRow,
  ColumnConfig,
} from "@/lib/types";
import { CREATABLE_TYPES, COMPUTED_TYPES } from "@/lib/types";

interface TableGridProps {
  initialData: TableData;
}

type SortDir = "asc" | "desc" | null;

interface FilterState {
  columnId: number | null;
  value: string;
}

/** Uniform row height (px). Cells never grow beyond this unless the user
 * explicitly resizes the row. Overflowing content pops over on hover. */
const ROW_HEIGHT = 36;

export function TableGrid({ initialData }: TableGridProps) {
  const [data, setData] = useState<TableData>(initialData);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<ColumnType>("TEXT");
  const [newColumnConfig, setNewColumnConfig] = useState<ColumnConfig>(null);
  const [renamingColumnId, setRenamingColumnId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingTable, setRenamingTable] = useState(false);
  const [tableRenameValue, setTableRenameValue] = useState("");

  // Sort state
  const [sortColumnId, setSortColumnId] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Filter state
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [filters, setFilters] = useState<FilterState[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");

  // Column resize drag state
  const [resizing, setResizing] = useState<{
    columnId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Column reorder drag state
  const [draggingColumnId, setDraggingColumnId] = useState<number | null>(null);
  const [dropTargetColumnId, setDropTargetColumnId] = useState<number | null>(null);

  // Target rows cache for LINK columns: linkColumnId -> ResolvedRow[]
  const [targetRowsByLink, setTargetRowsByLink] = useState<Record<number, ResolvedRow[]>>({});

  const refresh = useCallback(async () => {
    const updated = await api.getTableData(data.table.id);
    if (updated) {
      setData(updated);
      invalidateTargetRowsCache();
      // Re-fetch target rows for all link columns
      for (const col of updated.columns) {
        if (col.type === "LINK" && col.targetTableId) {
          getTargetRows(col.targetTableId).then((rows) => {
            setTargetRowsByLink((prev) => ({ ...prev, [col.id]: rows }));
          });
        }
      }
    }
  }, [data.table.id]);

  // On mount, fetch target rows for any LINK columns
  useEffect(() => {
    for (const col of data.columns) {
      if (col.type === "LINK" && col.targetTableId) {
        getTargetRows(col.targetTableId).then((rows) => {
          setTargetRowsByLink((prev) => ({ ...prev, [col.id]: rows }));
        });
      }
    }
  }, [data.columns]);

  // --- Column operations ---------------------------------------------------

  async function handleCreateColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newColumnName.trim()) return;
    try {
      await api.createColumn(
        data.table.id,
        newColumnName.trim(),
        newColumnType,
        newColumnConfig ?? undefined
      );
      setNewColumnName("");
      setNewColumnType("TEXT");
      setNewColumnConfig(null);
      setAddingColumn(false);
      await refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleDeleteColumn(columnId: number) {
    await api.deleteColumn(columnId);
    await refresh();
  }

  async function handleRenameColumn(columnId: number) {
    if (!renameValue.trim()) {
      setRenamingColumnId(null);
      return;
    }
    await api.renameColumn(columnId, renameValue.trim());
    setRenamingColumnId(null);
    setRenameValue("");
    await refresh();
  }

  async function handleSetPrimary(columnId: number) {
    await api.setColumnPrimary(columnId);
    await refresh();
  }

  async function handleResizeEnd(newWidth: number) {
    if (resizing) {
      await api.setColumnWidth(resizing.columnId, newWidth);
    }
    setResizing(null);
  }

  async function handleReorder(targetColumnId: number) {
    if (!draggingColumnId || draggingColumnId === targetColumnId) return;
    const orderedIds = data.columns.map((c) => c.id);
    const fromIdx = orderedIds.indexOf(draggingColumnId);
    const toIdx = orderedIds.indexOf(targetColumnId);
    orderedIds.splice(fromIdx, 1);
    orderedIds.splice(toIdx, 0, draggingColumnId);
    setDraggingColumnId(null);
    setDropTargetColumnId(null);
    await api.reorderColumns(data.table.id, orderedIds);
    await refresh();
  }

  // --- Row operations ------------------------------------------------------

  async function handleCreateRow() {
    await api.createRow(data.table.id);
    await refresh();
  }

  async function handleDeleteRow(rowId: number) {
    await api.deleteRow(rowId);
    await refresh();
  }

  // --- Cell update (local state) -------------------------------------------

  function handleCellUpdate(rowId: number, columnId: number, value: string | null) {
    setData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.row.id === rowId
          ? { ...r, cells: { ...r.cells, [columnId]: value } }
          : r
      ),
    }));
  }

  // --- Table rename --------------------------------------------------------

  async function handleRenameTable() {
    if (!tableRenameValue.trim()) {
      setRenamingTable(false);
      return;
    }
    await api.renameTable(data.table.id, tableRenameValue.trim());
    setRenamingTable(false);
    setTableRenameValue("");
    await refresh();
  }

  // --- Sort ----------------------------------------------------------------

  function toggleSort(columnId: number) {
    if (sortColumnId !== columnId) {
      setSortColumnId(columnId);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortColumnId(null);
      setSortDir(null);
    } else {
      setSortDir("asc");
    }
  }

  // --- Resize mouse handlers (global) --------------------------------------

  useEffect(() => {
    if (!resizing) return;
    const r = resizing;

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - r.startX;
      const newWidth = Math.max(60, Math.min(800, r.startWidth + delta));
      // Update local data for live feedback
      setData((prev) => ({
        ...prev,
        columns: prev.columns.map((c) =>
          c.id === r.columnId ? { ...c, width: newWidth } : c
        ),
      }));
    }

    function onMouseUp(e: MouseEvent) {
      const delta = e.clientX - r.startX;
      const newWidth = Math.max(60, Math.min(800, r.startWidth + delta));
      handleResizeEnd(newWidth);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // --- Sorted + filtered rows ----------------------------------------------

  const visibleRows = useMemo(() => {
    let rows = [...data.rows];

    // Apply column filters
    for (const f of filters) {
      if (f.columnId === null || !f.value) continue;
      const colId = f.columnId;
      rows = rows.filter((r) => {
        const cellVal = r.cells[colId] ?? "";
        return cellVal.toLowerCase().includes(f.value.toLowerCase());
      });
    }

    // Apply global search across all scalar cells + link labels + computed
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      rows = rows.filter((r) => {
        const scalarMatches = Object.values(r.cells).some((v) =>
          v?.toLowerCase().includes(q)
        );
        const linkMatches = Object.values(r.links).some((links) =>
          links.some((l) => l.targetLabel.toLowerCase().includes(q))
        );
        const computedMatches = Object.values(r.computed).some((v) =>
          v?.toLowerCase().includes(q)
        );
        return scalarMatches || linkMatches || computedMatches;
      });
    }

    // Apply sort
    if (sortColumnId !== null && sortDir !== null) {
      const col = data.columns.find((c) => c.id === sortColumnId);
      const isNumeric = col?.type === "NUMBER" || col?.type === "ROLLUP";
      rows.sort((a, b) => {
        let av: string | null;
        let bv: string | null;
        if (col && (col.type === "LOOKUP" || col.type === "ROLLUP")) {
          av = a.computed[col.id] ?? null;
          bv = b.computed[col.id] ?? null;
        } else if (col && col.type === "LINK") {
          av = (a.links[col.id] ?? []).map((l) => l.targetLabel).join(", ");
          bv = (b.links[col.id] ?? []).map((l) => l.targetLabel).join(", ");
        } else {
          av = a.cells[sortColumnId] ?? null;
          bv = b.cells[sortColumnId] ?? null;
        }
        if (av === null && bv === null) return 0;
        if (av === null) return sortDir === "asc" ? 1 : -1;
        if (bv === null) return sortDir === "asc" ? -1 : 1;
        if (isNumeric) {
          const an = Number(av);
          const bn = Number(bv);
          return sortDir === "asc" ? an - bn : bn - an;
        }
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      });
    }

    return rows;
  }, [data.rows, data.columns, filters, globalSearch, sortColumnId, sortDir]);

  // --- Render helpers ------------------------------------------------------

  function renderCell(row: ResolvedRow, column: ResolvedColumn) {
    // Computed columns are read-only
    if (COMPUTED_TYPES.includes(column.type)) {
      const val = row.computed[column.id] ?? null;
      return (
        <CellWrapper height={ROW_HEIGHT} label={column.name}>
          <div className="w-full h-full px-3 py-2 text-sm text-muted-foreground truncate">
            {val ?? <span className="text-muted-foreground/50">—</span>}
          </div>
        </CellWrapper>
      );
    }

    if (column.type === "LINK") {
      const links = row.links[column.id] ?? [];
      const targetRows = targetRowsByLink[column.id] ?? [];
      const expanded = (
        <div className="flex flex-wrap gap-1.5 items-center">
          {links.length === 0 ? (
            <span className="text-muted-foreground text-sm">No links</span>
          ) : (
            links.map((l) => (
              <span
                key={l.linkId}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-medium"
              >
                {l.targetLabel}
              </span>
            ))
          )}
        </div>
      );
      return (
        <CellWrapper height={ROW_HEIGHT} label={column.name} expandedContent={expanded}>
          <LinkedCell
            rowId={row.row.id}
            linkColumnId={column.id}
            targetTableId={column.targetTableId!}
            targetTableName={data.relatedTables[column.targetTableId!] ?? "rows"}
            links={links}
            targetRows={targetRows}
            onUpdate={refresh}
          />
        </CellWrapper>
      );
    }

    if (column.type === "CHECKBOX") {
      return (
        <CellWrapper height={ROW_HEIGHT} enableExpand={false}>
          <CheckboxCell
            rowId={row.row.id}
            columnId={column.id}
            value={row.cells[column.id] ?? null}
            onUpdate={(v) => handleCellUpdate(row.row.id, column.id, v)}
          />
        </CellWrapper>
      );
    }

    // For LONG_TEXT / TEXT we want the dialog to show the full untruncated value.
    const rawValue = row.cells[column.id] ?? null;
    const expanded =
      column.type === "LONG_TEXT" && rawValue ? (
        <div className="whitespace-pre-wrap break-words">{rawValue}</div>
      ) : undefined;

    return (
      <CellWrapper height={ROW_HEIGHT} label={column.name} expandedContent={expanded}>
        <EditableCell
          rowId={row.row.id}
          columnId={column.id}
          type={column.type}
          initialValue={rawValue}
          options={column.options}
          onUpdate={(v) => handleCellUpdate(row.row.id, column.id, v)}
        />
      </CellWrapper>
    );
  }

  // --- Add-column config UI for LINK type ----------------------------------

  const linkTargetTables = useLinkTargetTables(data.table.id);

  // When the user picks LINK, we need a target table; show a select.
  function renderNewColumnTypeExtra() {
    if (newColumnType === "LINK") {
      return (
        <Select
          value={String((newColumnConfig as { targetTableId?: number })?.targetTableId ?? "")}
          onValueChange={(v) =>
            setNewColumnConfig({ targetTableId: Number(v) })
          }
        >
          <SelectTrigger className="h-7 text-xs w-[140px]">
            <SelectValue placeholder="Target table" />
          </SelectTrigger>
          <SelectContent>
            {linkTargetTables.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return null;
  }

  if (!data) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card gap-2">
        <div className="min-w-0 flex-1">
          {renamingTable ? (
            <Input
              autoFocus
              value={tableRenameValue}
              onChange={(e) => setTableRenameValue(e.target.value)}
              onBlur={handleRenameTable}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameTable();
                if (e.key === "Escape") setRenamingTable(false);
              }}
              className="h-7 text-sm w-48"
            />
          ) : (
            <button
              onClick={() => {
                setTableRenameValue(data.table.name);
                setRenamingTable(true);
              }}
              className="text-sm font-semibold text-card-foreground hover:text-primary text-left"
              title="Click to rename"
            >
              {data.table.name}
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            {visibleRows.length} of {data.rows.length}{" "}
            {data.rows.length === 1 ? "row" : "rows"} · {data.columns.length}{" "}
            {data.columns.length === 1 ? "column" : "columns"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowFilterBar((v) => !v)}
            className={showFilterBar ? "text-primary" : ""}
          >
            <Search className="h-4 w-4 mr-1.5" />
            Filter
          </Button>
          <Button size="sm" variant="outline" onClick={handleCreateRow}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add row
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilterBar && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 flex-wrap">
          <Input
            placeholder="Search all fields..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="h-7 text-sm w-48"
          />
          {filters.map((f, i) => (
            <div key={i} className="flex items-center gap-1">
              <Select
                value={String(f.columnId ?? "")}
                onValueChange={(v) =>
                  setFilters((prev) =>
                    prev.map((x, idx) =>
                      idx === i ? { ...x, columnId: Number(v) } : x
                    )
                  )
                }
              >
                <SelectTrigger className="h-7 text-xs w-[120px]">
                  <SelectValue placeholder="Column" />
                </SelectTrigger>
                <SelectContent>
                  {data.columns
                    .filter((c) => !COMPUTED_TYPES.includes(c.type) && c.type !== "LINK")
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="contains..."
                value={f.value}
                onChange={(e) =>
                  setFilters((prev) =>
                    prev.map((x, idx) =>
                      idx === i ? { ...x, value: e.target.value } : x
                    )
                  )
                }
                className="h-7 text-sm w-32"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() =>
                  setFilters((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setFilters((prev) => [...prev, { columnId: null, value: "" }])}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add filter
          </Button>
        </div>
      )}

      {/* Grid */}
      {/* Outer container handles horizontal scroll so its scrollbar stays
          pinned to the bottom of the viewport (always visible). The inner
          container handles vertical scroll, keeping the sticky header working.
          `w-max min-w-full` makes the inner div exactly as wide as the table
          (but never narrower than the viewport) so horizontal overflow is
          pushed to the outer container instead of being clipped. */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full overflow-y-auto w-max min-w-full">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr>
              <th className="w-10 border-b border-r border-border bg-muted/50"></th>
              {data.columns.map((column) => {
                const isDragging = draggingColumnId === column.id;
                const isDropTarget = dropTargetColumnId === column.id;
                return (
                  <th
                    key={column.id}
                    className="border-b border-r border-border bg-muted/50 relative select-none"
                    style={{ width: column.width, minWidth: column.width }}
                    draggable
                    onDragStart={() => setDraggingColumnId(column.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggingColumnId && draggingColumnId !== column.id) {
                        setDropTargetColumnId(column.id);
                      }
                    }}
                    onDrop={() => handleReorder(column.id)}
                    onDragEnd={() => {
                      setDraggingColumnId(null);
                      setDropTargetColumnId(null);
                    }}
                  >
                    <div
                      className={`flex items-center justify-between px-3 py-2 group ${
                        isDragging ? "opacity-40" : ""
                      } ${isDropTarget ? "ring-2 ring-primary ring-inset" : ""}`}
                    >
                      <div className="flex flex-col items-start min-w-0 flex-1">
                        {renamingColumnId === column.id ? (
                          <Input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleRenameColumn(column.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameColumn(column.id);
                              if (e.key === "Escape") setRenamingColumnId(null);
                            }}
                            className="h-5 text-xs py-0 px-1 w-full max-w-[140px]"
                          />
                        ) : (
                          <div className="flex items-center gap-1 w-full">
                            {column.is_primary === 1 && (
                              <Star className="h-3 w-3 text-primary shrink-0" />
                            )}
                            <span
                              className="font-medium text-card-foreground truncate cursor-text"
                              onClick={() => {
                                setRenamingColumnId(column.id);
                                setRenameValue(column.name);
                              }}
                            >
                              {column.name}
                            </span>
                          </div>
                        )}
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {column.type.toLowerCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => toggleSort(column.id)}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                          title="Sort"
                        >
                          {sortColumnId === column.id && sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          ) : sortColumnId === column.id && sortDir === "desc" ? (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setRenamingColumnId(column.id);
                                setRenameValue(column.name);
                              }}
                            >
                              Rename column
                            </DropdownMenuItem>
                            {column.is_primary !== 1 && (
                              <DropdownMenuItem onClick={() => handleSetPrimary(column.id)}>
                                <Star className="h-4 w-4 mr-2" />
                                Set as primary
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteColumn(column.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete column
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {/* Resize handle */}
                    <div
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/50 group-hover:bg-primary/30"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setResizing({
                          columnId: column.id,
                          startX: e.clientX,
                          startWidth: column.width,
                        });
                      }}
                    />
                  </th>
                );
              })}
              <th className="border-b border-border bg-muted/50 min-w-[160px]">
                {addingColumn ? (
                  <form
                    onSubmit={handleCreateColumn}
                    className="flex items-center gap-2 px-2 py-1.5 flex-wrap"
                  >
                    <Input
                      autoFocus
                      placeholder="Column name"
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      onBlur={() => {
                        if (!newColumnName.trim()) setAddingColumn(false);
                      }}
                      className="h-7 text-sm flex-1 min-w-[100px]"
                    />
                    <Select
                      value={newColumnType}
                      onValueChange={(v) => {
                        setNewColumnType(v as ColumnType);
                        if (v !== "LINK") setNewColumnConfig(null);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CREATABLE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.toLowerCase().replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {renderNewColumnTypeExtra()}
                    <Button type="submit" size="sm" className="h-7 px-2">
                      Add
                    </Button>
                  </form>
                ) : (
                  <button
                    onClick={() => setAddingColumn(true)}
                    className="flex items-center gap-1.5 w-full px-3 py-2 text-left text-muted-foreground hover:text-accent-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add column
                  </button>
                )}
              </th>
            </tr>
          </thead>

          <tbody>
            {data.rows.length === 0 && data.columns.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-12 text-center text-muted-foreground border-b border-border"
                >
                  Add a column and a row to start building your table.
                </td>
              </tr>
            )}
            {data.rows.length === 0 && data.columns.length > 0 && (
              <tr>
                <td
                  colSpan={data.columns.length + 2}
                  className="px-4 py-12 text-center text-muted-foreground border-b border-border"
                >
                  No rows yet. Click &quot;Add row&quot; to create one.
                </td>
              </tr>
            )}
            {visibleRows.length === 0 && data.rows.length > 0 && (
              <tr>
                <td
                  colSpan={data.columns.length + 2}
                  className="px-4 py-12 text-center text-muted-foreground border-b border-border"
                >
                  No rows match your filters.
                </td>
              </tr>
            )}
            {visibleRows.map((row, rowIndex) => (
              <tr key={row.row.id} className="hover:bg-accent/30 group" style={{ height: ROW_HEIGHT }}>
                <td className="border-b border-r border-border bg-muted/30 text-center text-xs text-muted-foreground w-10 align-middle">
                  <div className="flex items-center justify-center h-full">
                    {rowIndex + 1}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 ml-0.5"
                      onClick={() => handleDeleteRow(row.row.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </td>
                {data.columns.map((column) => (
                  <td
                    key={column.id}
                    className="border-b border-r border-border relative align-top p-0"
                    style={{ width: column.width, minWidth: column.width }}
                  >
                    {renderCell(row, column)}
                  </td>
                ))}
                <td className="border-b border-border"></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook: list of tables that can be LINK targets (all tables except current)
// ---------------------------------------------------------------------------

function useLinkTargetTables(currentTableId: number) {
  const [tables, setTables] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    api.listAllTables().then((all) => {
      setTables(
        all
          .filter((t) => t.id !== currentTableId)
          .map((t) => ({ id: t.id, name: t.name }))
      );
    });
  }, [currentTableId]);

  return tables;
}
