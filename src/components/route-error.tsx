import { useI18n } from "../i18n/provider";
export function RouteError() {
  const { t } = useI18n();
  return (
    <main className="access card">
      <h1>{t("unknown")}</h1>
      <p>{t("network")}</p>
      <button className="primary" onClick={() => window.location.reload()}>
        {t("retry")}
      </button>
    </main>
  );
}
