import { useState } from "react";
import { useDebounced } from "../app/use-debounced";
import { useQuery } from "@tanstack/react-query";
import { list, lookup, PAGE_SIZE } from "../data/repository";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { title, type Kind } from "../domain/model";
export function RelationPicker({
  id,
  kind,
  value,
  disabled,
  onChange,
  required,
}: {
  id: string;
  kind: Kind;
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
  required?: boolean;
}) {
  const { event } = useEvent();
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const settled = useDebounced(search);
  const q = useQuery({
    queryKey: ["event", event.id, "options", kind, settled, page],
    queryFn: () => list(event.id, kind, settled, page),
    enabled: !disabled,
  });
  const selected = useQuery({
    queryKey: ["event", event.id, "lookup", kind, value],
    queryFn: () => lookup(event.id, kind, value),
    enabled: !!value,
  });
  const rows = q.data ?? [];
  const options =
    selected.data && !rows.some((r) => r.id === value)
      ? [selected.data, ...rows]
      : rows;
  return (
    <div className="relation-picker">
      {!disabled && (
        <input
          aria-label={
            t("search") + " · " + t(kind === "person" ? "people" : kind)
          }
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={t("search")}
        />
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
      >
        <option value="">{t("select")}</option>
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {title(kind, row, locale)}
            {row.is_deleted ? " · " + t("archived") : ""}
          </option>
        ))}
      </select>
      {!disabled && (page > 0 || rows.length === PAGE_SIZE) && (
        <div className="picker-pager">
          <button
            type="button"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            {t("previous")}
          </button>
          <button
            type="button"
            disabled={rows.length < PAGE_SIZE}
            onClick={() => setPage(page + 1)}
          >
            {t("next")}
          </button>
        </div>
      )}
      {q.error && <small role="alert">{t("unknown")}</small>}
    </div>
  );
}
