import { useI18n } from "../i18n/provider";
import {
  eventFields,
  eventCurrencies,
  type EventDraft,
} from "../domain/event-setup";
export function EventFields({
  draft,
  errors,
  disabled,
  onChange,
}: {
  draft: EventDraft;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <p className="notice">{t("eventPeriodHint")}</p>
      <div className="form-grid">
        {eventFields.map(([key, label, type]) => (
          <label key={key} htmlFor={"event-" + key}>
            <span>
              {t(label)}
              {key !== "name" && <small> · {t("optional")}</small>}
            </span>
            {key === "description" || key === "manager_notes" ? (
              <textarea
                id={"event-" + key}
                name={key}
                value={draft[key]}
                maxLength={10000}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
              />
            ) : key === "base_currency" ? (
              <select
                id={"event-" + key}
                name={key}
                value={draft[key]}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
              >
                <option value="">{t("notSet")}</option>
                {eventCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={"event-" + key}
                name={key}
                type={type}
                value={draft[key]}
                required={key === "name"}
                maxLength={type === "text" ? 200 : undefined}
                min={key === "year" ? 1900 : undefined}
                max={key === "year" ? 2200 : undefined}
                step={key === "year" ? 1 : undefined}
                disabled={disabled}
                aria-invalid={!!errors[key]}
                aria-describedby={
                  errors[key] ? "event-error-" + key : undefined
                }
                onChange={(e) => onChange(key, e.target.value)}
              />
            )}
            {errors[key] && (
              <span role="alert" id={"event-error-" + key}>
                {t(errors[key])}
              </span>
            )}
          </label>
        ))}
      </div>
    </>
  );
}
