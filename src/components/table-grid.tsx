"use client";

import { useState, useCallback } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { EditableCell } from "@/components/editable-cell";
import type { TableData, ColumnType } from "@/lib/types";

interface TableGridProps {
  initialData: TableData;
}

export function TableGrid({ initialData }: TableGridProps) {
  const [data, setData] = useState<TableData>(initialData);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<ColumnType>("TEXT");

  const refresh = useCallback(async () => {
    const updated = await api.getTableData(data.table.id);
    if (updated) setData(updated);
  }, [data.table.id]);

  async function handleCreateColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newColumnName.trim()) return;
    await api.createColumn(data.table.id, newColumnName.trim(), newColumnType);
    setNewColumnName("");
    setNewColumnType("TEXT");
    setAddingColumn(false);
    await refresh();
  }

  async function handleCreateRow() {
    await api.createRow(data.table.id);
    await refresh();
  }

  async function handleDeleteColumn(columnId: number) {
    await api.deleteColumn(columnId);
    await refresh();
  }

  async function handleDeleteRow(rowId: number) {
    await api.deleteRow(rowId);
    await refresh();
  }

  function handleCellUpdate(rowId: number, columnId: number, value: string | null) {
    setData((prev) => ({
      ...prev,
      cells: {
        ...prev.cells,
        [rowId]: {
          ...prev.cells[rowId],
          [columnId]: value,
        },
      },
    }));
  }

  if (!data) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div>
          <h1 className="text-sm font-semibold text-card-foreground">{data.table.name}</h1>
          <p className="text-xs text-muted-foreground">
            {data.rows.length} {data.rows.length === 1 ? "row" : "rows"} ·{" "}
            {data.columns.length} {data.columns.length === 1 ? "column" : "columns"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleCreateRow}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add row
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th className="w-10 border-b border-r border-border bg-muted/50"></th>
              {data.columns.map((column) => (
                <th
                  key={column.id}
                  className="border-b border-r border-border bg-muted/50 min-w-[160px] max-w-[320px]"
                >
                  <div className="flex items-center justify-between px-3 py-2 group">
                    <div className="flex flex-col items-start min-w-0">
                      <span className="font-medium text-card-foreground truncate">
                        {column.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {column.type.toLowerCase()}
                      </span>
                    </div>
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
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteColumn(column.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete column
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
              ))}
              <th className="border-b border-border bg-muted/50 min-w-[160px]">
                {addingColumn ? (
                  <form
                    onSubmit={handleCreateColumn}
                    className="flex items-center gap-2 px-2 py-1.5"
                  >
                    <Input
                      autoFocus
                      placeholder="Column name"
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      onBlur={() => {
                        if (!newColumnName.trim()) setAddingColumn(false);
                      }}
                      className="h-7 text-sm flex-1"
                    />
                    <Select
                      value={newColumnType}
                      onValueChange={(v) => setNewColumnType(v as ColumnType)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[90px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TEXT">Text</SelectItem>
                        <SelectItem value="NUMBER">Number</SelectItem>
                      </SelectContent>
                    </Select>
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
            {data.rows.map((row, rowIndex) => (
              <tr key={row.id} className="hover:bg-accent/30 group">
                <td className="border-b border-r border-border bg-muted/30 text-center text-xs text-muted-foreground w-10">
                  <div className="flex items-center justify-center h-full">
                    {rowIndex + 1}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 ml-0.5"
                      onClick={() => handleDeleteRow(row.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </td>
                {data.columns.map((column) => (
                  <td
                    key={column.id}
                    className="border-b border-r border-border min-w-[160px] max-w-[320px] p-0"
                  >
                    <EditableCell
                      rowId={row.id}
                      columnId={column.id}
                      type={column.type}
                      initialValue={data.cells[row.id]?.[column.id] ?? null}
                      onUpdate={(value) => handleCellUpdate(row.id, column.id, value)}
                    />
                  </td>
                ))}
                <td className="border-b border-border"></td>
              </tr>
            ))}
            {data.rows.length > 0 && (
              <tr>
                <td className="border-b border-r border-border"></td>
                <td
                  colSpan={data.columns.length + 1}
                  className="border-b border-border"
                >
                  <button
                    onClick={handleCreateRow}
                    className="flex items-center gap-1.5 w-full px-3 py-2 text-left text-muted-foreground hover:text-accent-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add row
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
