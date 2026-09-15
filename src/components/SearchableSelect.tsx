import { useMemo, useRef, useState } from "react";

export type SearchableSelectOption = {
  id: number;
  label: string;
};

type SearchableSelectProps = {
  value: number | null;
  options: SearchableSelectOption[];
  onChange: (value: number | null) => void;
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
};

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const blurTimer = useRef<number | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options.slice(0, 60);
    return options
      .filter((option) => (
        option.label.toLocaleLowerCase().includes(normalized)
        || String(option.id).includes(normalized)
      ))
      .slice(0, 60);
  }, [options, query]);

  function select(nextValue: number | null) {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    onChange(nextValue);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className={`searchable-select ${disabled ? "searchable-select-disabled" : ""}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : selected?.label ?? (value === null ? emptyLabel ?? "" : "")}
        onFocus={() => {
          if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => {
            setQuery("");
            setOpen(false);
          }, 120);
        }}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setQuery("");
            setOpen(false);
            event.currentTarget.blur();
          } else if (event.key === "Enter" && open) {
            const first = filtered[0];
            if (first) {
              event.preventDefault();
              select(first.id);
            } else if (emptyLabel) {
              event.preventDefault();
              select(null);
            }
          }
        }}
      />
      {open && !disabled && (
        <div className="searchable-select-menu" role="listbox">
          {emptyLabel && (
            <button
              type="button"
              className={`searchable-select-option ${value === null ? "is-selected" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(null)}
            >
              {emptyLabel}
            </button>
          )}
          {filtered.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={`searchable-select-option ${option.id === value ? "is-selected" : ""}`}
              key={option.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(option.id)}
            >
              {option.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="searchable-select-empty">没有匹配项</div>
          )}
        </div>
      )}
    </div>
  );
}
