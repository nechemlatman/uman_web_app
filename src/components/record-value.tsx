import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { lookup } from "../data/repository";
import { useEvent } from "../app/event";
import { useI18n, formatDate } from "../i18n/provider";
import { catalog, type Field } from "../domain/catalog";
import { title, type Kind, type RecordRow } from "../domain/model";
import { Badge } from "./states";
export function Reference({ kind, id }: { kind: Kind; id: string }) {
  const { event } = useEvent();
  const { t, locale } = useI18n();
  const q = useQuery({
    queryKey: ["event", event.id, "lookup", kind, id],
    queryFn: () => lookup(event.id, kind, id),
    staleTime: 30000,
  });
  return (
    <Link to={"/e/" + event.id + "/" + kind + "/" + id}>
      {q.data
        ? title(kind, q.data, locale)
        : t(q.error ? "unknownRecord" : "loading")}
    </Link>
  );
}
export function RecordValue({ field, row }: { field: Field; row: RecordRow }) {
  const { t, locale } = useI18n();
  const v = row[field.key];
  if (v === null || v === undefined || v === "")
    return <span className="muted">—</span>;
  if (field.relation) return <Reference kind={field.relation} id={String(v)} />;
  if (field.type === "select") return <Badge value={v} />;
  if (field.type === "checkbox")
    return <span>{t(v ? "active" : "INACTIVE")}</span>;
  if (field.type === "date" || field.type === "datetime-local")
    return <bdi>{formatDate(v, locale, field.type === "datetime-local")}</bdi>;
  if (field.type === "tel")
    return (
      <a dir="ltr" href={"tel:" + String(v).replace(/[^+0-9]/g, "")}>
        {String(v)}
      </a>
    );
  return <bdi className="wrap">{String(v)}</bdi>;
}
export function ColumnValue({
  kind,
  column,
  row,
}: {
  kind: Kind;
  column: string;
  row: RecordRow;
}) {
  const field = catalog[kind].fields.find((f) => f.key === column);
  return field ? (
    <RecordValue field={field} row={row} />
  ) : (
    <bdi>{String(row[column] ?? "—")}</bdi>
  );
}
