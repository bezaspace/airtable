"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Database,
  MoreHorizontal,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import type { Base, Table } from "@/lib/types";

interface AppSidebarProps {
  bases: Base[];
  initialTables: Record<number, Table[]>;
  selectedBaseId: number | null;
  selectedTableId: number | null;
}

export function AppSidebar({
  bases: initialBases,
  initialTables,
  selectedBaseId,
  selectedTableId,
}: AppSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bases, setBases] = useState<Base[]>(initialBases);
  const [tablesByBase, setTablesByBase] = useState<Record<number, Table[]>>(initialTables);
  const [expandedBases, setExpandedBases] = useState<Set<number>>(
    () => new Set(initialBases.map((b) => b.id))
  );
  const [addingBase, setAddingBase] = useState(false);
  const [newBaseName, setNewBaseName] = useState("");
  const [addingTableForBase, setAddingTableForBase] = useState<number | null>(null);
  const [newTableName, setNewTableName] = useState("");

  const refreshBases = useCallback(async () => {
    const updated = await api.listBases();
    setBases(updated);
    const tables: Record<number, Table[]> = {};
    for (const base of updated) {
      tables[base.id] = await api.listTables(base.id);
    }
    setTablesByBase(tables);
  }, []);

  const refreshTables = useCallback(async (baseId: number) => {
    const tables = await api.listTables(baseId);
    setTablesByBase((prev) => ({ ...prev, [baseId]: tables }));
  }, []);

  function selectTable(baseId: number, tableId: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("base", String(baseId));
    params.set("table", String(tableId));
    router.replace(`?${params.toString()}`);
  }

  function toggleBase(baseId: number) {
    setExpandedBases((prev) => {
      const next = new Set(prev);
      if (next.has(baseId)) next.delete(baseId);
      else next.add(baseId);
      return next;
    });
  }

  async function handleCreateBase(e: React.FormEvent) {
    e.preventDefault();
    if (!newBaseName.trim()) return;
    const base = await api.createBase(newBaseName.trim());
    setNewBaseName("");
    setAddingBase(false);
    await refreshBases();
    setExpandedBases((prev) => new Set(prev).add(base.id));
  }

  async function handleCreateTable(e: React.FormEvent, baseId: number) {
    e.preventDefault();
    if (!newTableName.trim()) return;
    const table = await api.createTable(baseId, newTableName.trim());
    setNewTableName("");
    setAddingTableForBase(null);
    await refreshTables(baseId);
    setExpandedBases((prev) => new Set(prev).add(baseId));
    selectTable(baseId, table.id);
  }

  async function handleDeleteBase(baseId: number) {
    await api.deleteBase(baseId);
    await refreshBases();
    if (selectedBaseId === baseId) {
      router.replace("/");
    }
  }

  async function handleDeleteTable(baseId: number, tableId: number) {
    await api.deleteTable(tableId);
    await refreshTables(baseId);
    if (selectedTableId === tableId) {
      const remaining = tablesByBase[baseId]?.filter((t) => t.id !== tableId);
      const nextTable = remaining?.[0] ?? tablesByBase[baseId]?.[0];
      if (nextTable) {
        selectTable(baseId, nextTable.id);
      } else {
        router.replace("/");
      }
    }
  }

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col h-full shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
          <Database className="h-4 w-4" />
          Bases
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setAddingBase(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {addingBase && (
          <form onSubmit={handleCreateBase} className="px-2 py-1">
            <Input
              autoFocus
              placeholder="Base name"
              value={newBaseName}
              onChange={(e) => setNewBaseName(e.target.value)}
              onBlur={() => {
                if (!newBaseName.trim()) setAddingBase(false);
              }}
              className="h-8 text-sm"
            />
          </form>
        )}

        {bases.map((base) => {
          const isExpanded = expandedBases.has(base.id);
          const tables = tablesByBase[base.id] ?? [];
          const isSelectedBase = selectedBaseId === base.id;

          return (
            <div key={base.id}>
              <div
                className={`flex items-center gap-1 group rounded-md ${
                  isSelectedBase ? "bg-accent/70" : "hover:bg-accent/50"
                }`}
              >
                <button
                  onClick={() => toggleBase(base.id)}
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-card-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="truncate">{base.name}</span>
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
                    <DropdownMenuItem onClick={() => setAddingTableForBase(base.id)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add table
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDeleteBase(base.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete base
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {tables.map((table) => (
                    <div
                      key={table.id}
                      className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                        selectedTableId === table.id
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                      }`}
                      onClick={() => selectTable(base.id, table.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Table2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{table.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTable(base.id, table.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {addingTableForBase === base.id ? (
                    <form onSubmit={(e) => handleCreateTable(e, base.id)} className="py-1">
                      <Input
                        autoFocus
                        placeholder="Table name"
                        value={newTableName}
                        onChange={(e) => setNewTableName(e.target.value)}
                        onBlur={() => {
                          if (!newTableName.trim()) setAddingTableForBase(null);
                        }}
                        className="h-7 text-sm"
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => setAddingTableForBase(base.id)}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-accent-foreground w-full"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add table
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {bases.length === 0 && !addingBase && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No bases yet. Create one to get started.
          </div>
        )}
      </div>
    </aside>
  );
}
