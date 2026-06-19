"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "@/lib/api-client";
import type { ColumnType, ResolvedOption } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EditableCellProps {
  rowId: number;
  columnId: number;
  type: ColumnType;
  initialValue: string | null;
  options?: ResolvedOption[];
  onUpdate: (value: string | null) => void;
}

export function EditableCell({
  rowId,
  columnId,
  type,
  initialValue,
  options,
  onUpdate,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(initialValue ?? "");

  const startEditing = useCallback(() => {
    setEditValue(initialValue ?? "");
    setIsEditing(true);
  }, [initialValue]);

  const commit = useCallback(
    async (value: string | null) => {
      const trimmed = value === "" ? null : value;
      if (trimmed !== initialValue) {
        await api.updateCell(rowId, columnId, trimmed);
        onUpdate(trimmed);
      }
      setIsEditing(false);
    },
    [initialValue, rowId, columnId, onUpdate]
  );

  // --- Type-specific read views --------------------------------------------

  if (!isEditing) {
    return <ReadView type={type} value={initialValue} options={options} onStartEdit={startEditing} />;
  }

  // --- Type-specific edit views --------------------------------------------

  switch (type) {
    case "CHECKBOX":
      // Checkbox commits immediately on toggle; no separate edit mode needed.
      return (
        <ReadView type={type} value={initialValue} options={options} onStartEdit={startEditing} />
      );

    case "SELECT":
      return (
        <SelectEditor
          value={initialValue}
          options={options ?? []}
          onCommit={commit}
          onCancel={() => setIsEditing(false)}
        />
      );

    case "MULTI_SELECT":
      return (
        <MultiSelectEditor
          value={initialValue}
          options={options ?? []}
          onCommit={commit}
          onCancel={() => setIsEditing(false)}
        />
      );

    case "DATE":
      return (
        <DateEditor
          value={initialValue}
          onCommit={commit}
          onCancel={() => setIsEditing(false)}
        />
      );

    case "LONG_TEXT":
      return (
        <LongTextEditor
          value={initialValue ?? ""}
          onCommit={commit}
          onCancel={() => setIsEditing(false)}
        />
      );

    case "URL":
    case "EMAIL":
    case "TEXT":
    case "NUMBER":
    default:
      return (
        <TextEditor
          type={type}
          value={editValue}
          onChange={setEditValue}
          onCommit={() => commit(editValue)}
          onCancel={() => setIsEditing(false)}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Read view
// ---------------------------------------------------------------------------

function ReadView({
  type,
  value,
  options,
  onStartEdit,
}: {
  type: ColumnType;
  value: string | null;
  options?: ResolvedOption[];
  onStartEdit: () => void;
}) {
  if (type === "CHECKBOX") {
    // Checkbox is handled by the dedicated CheckboxCell wrapper in the grid,
    // so this branch should never render for CHECKBOX. Fallback just in case:
    return (
      <div onClick={onStartEdit} className="w-full h-full px-3 py-2 text-sm cursor-pointer">
        <span className="text-muted-foreground">{value === "1" ? "Yes" : "No"}</span>
      </div>
    );
  }

  if (type === "SELECT") {
    const opt = options?.find((o) => o.value === value);
    return (
      <div
        onClick={onStartEdit}
        className="w-full h-full px-3 py-2 text-sm cursor-pointer truncate"
      >
        {opt ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
            style={optionStyle(opt.color)}
          >
            {opt.value}
          </span>
        ) : (
          <span className="text-muted-foreground">Empty</span>
        )}
      </div>
    );
  }

  if (type === "MULTI_SELECT") {
    const values = value ? value.split("\n").filter(Boolean) : [];
    return (
      <div
        onClick={onStartEdit}
        className="w-full min-h-full px-3 py-2 text-sm cursor-pointer flex flex-wrap gap-1 items-center"
      >
        {values.length === 0 ? (
          <span className="text-muted-foreground">Empty</span>
        ) : (
          values.map((v) => {
            const opt = options?.find((o) => o.value === v);
            return (
              <span
                key={v}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                style={optionStyle(opt?.color)}
              >
                {v}
              </span>
            );
          })
        )}
      </div>
    );
  }

  if (type === "URL" && value) {
    return (
      <div className="w-full h-full px-3 py-2 text-sm truncate">
        <a
          href={value.startsWith("http") ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      </div>
    );
  }

  if (type === "EMAIL" && value) {
    return (
      <div className="w-full h-full px-3 py-2 text-sm truncate">
        <a
          href={`mailto:${value}`}
          className="text-blue-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      </div>
    );
  }

  if (type === "DATE" && value) {
    return (
      <div onClick={onStartEdit} className="w-full h-full px-3 py-2 text-sm cursor-pointer truncate">
        {value}
      </div>
    );
  }

  if (type === "LONG_TEXT" && value) {
    return (
      <div
        onClick={onStartEdit}
        className="w-full min-h-full px-3 py-2 text-sm cursor-pointer whitespace-pre-wrap break-words"
      >
        {value}
      </div>
    );
  }

  // TEXT / NUMBER default
  return (
    <div
      onClick={onStartEdit}
      className="w-full min-h-full px-3 py-2 text-sm text-foreground truncate cursor-text"
    >
      {value ?? <span className="text-muted-foreground">Empty</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

function TextEditor({
  type,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  type: ColumnType;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      type={type === "NUMBER" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
      className="w-full h-full px-3 py-2 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
      placeholder="Empty"
    />
  );
}

function LongTextEditor({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (v: string | null) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [local, setLocal] = useState(value);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, []);

  return (
    <textarea
      ref={ref}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        if (ref.current) {
          ref.current.style.height = "auto";
          ref.current.style.height = `${ref.current.scrollHeight}px`;
        }
      }}
      onBlur={() => onCommit(local)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onCommit(local);
        if (e.key === "Escape") onCancel();
      }}
      className="w-full min-h-[40px] px-3 py-2 bg-background border border-border rounded text-sm text-foreground outline-none resize-y"
      placeholder="Empty (Ctrl+Enter to save)"
    />
  );
}

function DateEditor({
  value,
  onCommit,
  onCancel,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      type="date"
      value={value ?? ""}
      onChange={(e) => onCommit(e.target.value || null)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      className="w-full h-full px-3 py-2 bg-transparent border-none outline-none text-sm text-foreground"
    />
  );
}

function SelectEditor({
  value,
  options,
  onCommit,
  onCancel,
}: {
  value: string | null;
  options: ResolvedOption[];
  onCommit: (v: string | null) => void;
  onCancel: () => void;
}) {
  return (
    <select
      autoFocus
      value={value ?? ""}
      onChange={(e) => onCommit(e.target.value || null)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      className="w-full h-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground outline-none"
    >
      <option value="">Empty</option>
      {options.map((o) => (
        <option key={o.id} value={o.value}>
          {o.value}
        </option>
      ))}
    </select>
  );
}

function MultiSelectEditor({
  value,
  options,
  onCommit,
  onCancel,
}: {
  value: string | null;
  options: ResolvedOption[];
  onCommit: (v: string | null) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(value ? value.split("\n").filter(Boolean) : [])
  );

  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setSelected(next);
  }

  function commit() {
    onCommit(selected.size === 0 ? null : [...selected].join("\n"));
  }

  return (
    <div className="w-full min-h-[40px] px-2 py-2 bg-background border border-border rounded text-sm space-y-1">
      <div className="flex flex-wrap gap-1 mb-1">
        {options.map((o) => {
          const isSel = selected.has(o.value);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors",
                isSel ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"
              )}
              style={optionStyle(o.color)}
            >
              {o.value}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={commit}
          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a background/foreground style for an option chip based on a color. */
function optionStyle(color: string | null | undefined): React.CSSProperties {
  if (!color) {
    return {
      backgroundColor: "hsl(var(--muted) / 0.5)",
      color: "hsl(var(--muted-foreground))",
    };
  }
  // Accept hex or hsl strings; fall back to muted if invalid.
  try {
    return { backgroundColor: color + "33", color };
  } catch {
    return {
      backgroundColor: "hsl(var(--muted) / 0.5)",
      color: "hsl(var(--muted-foreground))",
    };
  }
}

// ---------------------------------------------------------------------------
// CheckboxCell — a dedicated wrapper because checkboxes commit on click,
// not via an edit mode. Kept separate to avoid the ReadView special-case mess.
// ---------------------------------------------------------------------------

export function CheckboxCell({
  rowId,
  columnId,
  value,
  onUpdate,
}: {
  rowId: number;
  columnId: number;
  value: string | null;
  onUpdate: (v: string | null) => void;
}) {
  const checked = value === "1" || value === "true";

  async function toggle() {
    const next = checked ? "0" : "1";
    await api.updateCell(rowId, columnId, next);
    onUpdate(next);
  }

  return (
    <div className="w-full h-full flex items-center justify-center px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={toggle}
        className="h-4 w-4 cursor-pointer accent-primary"
      />
    </div>
  );
}
