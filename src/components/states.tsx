import { useI18n } from "../i18n/provider";
import { errorCode } from "../domain/validation";
export function Loading() {
  const { t } = useI18n();
  return (
    <div role="status" className="loading">
      <div className="skeleton" />
      <div className="skeleton" />
      <span>{t("loading")}</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="notice error" role="alert">
      <p>{t(errorCode(error))}</p>
      {retry && <button onClick={retry}>{t("retry")}</button>}
    </div>
  );
}
export function Empty({ searched = false }: { searched?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="empty">
      <span className="empty-symbol" aria-hidden="true">
        ◇
      </span>
      <h3>{t(searched ? "noResults" : "empty")}</h3>
      <p>{t(searched ? "noResultsHelp" : "emptyHelp")}</p>
    </div>
  );
}
export function Badge({ value }: { value: unknown }) {
  const { t } = useI18n();
  return (
    <span className={"badge tone-" + String(value).toLowerCase()}>
      {t(String(value ?? "notSet"))}
    </span>
  );
}
