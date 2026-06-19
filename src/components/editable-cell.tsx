"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { ColumnType } from "@/lib/types";

interface EditableCellProps {
  rowId: number;
  columnId: number;
  type: ColumnType;
  initialValue: string | null;
  onUpdate: (value: string | null) => void;
}

export function EditableCell({
  rowId,
  columnId,
  type,
  initialValue,
  onUpdate,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(initialValue ?? "");

  const startEditing = useCallback(() => {
    setEditValue(initialValue ?? "");
    setIsEditing(true);
  }, [initialValue]);

  const commit = useCallback(async () => {
    const trimmed = editValue.trim() || null;
    if (trimmed !== initialValue) {
      await api.updateCell(rowId, columnId, trimmed);
      onUpdate(trimmed);
    }
    setIsEditing(false);
  }, [editValue, initialValue, rowId, columnId, onUpdate]);

  return isEditing ? (
    <input
      autoFocus
      type={type === "NUMBER" ? "number" : "text"}
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setEditValue(initialValue ?? "");
          setIsEditing(false);
        }
      }}
      className="w-full h-full px-3 py-2 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
      placeholder="Empty"
    />
  ) : (
    <div
      onClick={startEditing}
      className="w-full h-full px-3 py-2 text-sm text-foreground truncate cursor-text"
    >
      {initialValue ?? (
        <span className="text-muted-foreground">Empty</span>
      )}
    </div>
  );
}
