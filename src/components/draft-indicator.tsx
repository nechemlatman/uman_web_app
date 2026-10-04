import { operationalMissing } from "../domain/drafts";
import { catalog } from "../domain/catalog";
import type { Kind } from "../domain/model";
import { useI18n } from "../i18n/provider";
export function DraftIndicator({
  kind,
  values,
  details = false,
}: {
  kind: Kind;
  values: Record<string, unknown>;
  details?: boolean;
}) {
  const { t } = useI18n();
  const missing = operationalMissing(kind, values);
  if (!missing.length) return null;
  const hint =
    t("completeBeforeOperation") +
    " " +
    missing
      .map((k) => t(catalog[kind].fields.find((f) => f.key === k)?.label ?? k))
      .join(", ");
  return details ? (
    <p className="notice">
      <strong>{t("incomplete")}</strong> · {hint}
    </p>
  ) : (
    <span className="badge" title={hint}>
      {t("incomplete")}
    </span>
  );
}
