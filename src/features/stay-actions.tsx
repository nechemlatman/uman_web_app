import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { createBeds, moveStay, rpc } from "../data/repository";
import { initialFields, encodeFields } from "../domain/catalog";
import { errorCode } from "../domain/validation";
import { validStayPrice } from "../domain/stay";
import type { RecordRow } from "../domain/model";
import { RelationPicker } from "../components/relation-picker";
import { ErrorState } from "../components/states";

function useStayDraft(dirty: boolean) {
  const { t } = useI18n();
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm(t("unsaved"))) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, t]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
export function BulkBeds({
  roomId,
  onClose,
  disabled = false,
}: {
  roomId: string;
  onClose: () => void;
  disabled?: boolean;
}) {
  const { event, writable } = useEvent(),
    { t } = useI18n(),
    qc = useQueryClient();
  const [count, setCount] = useState("8"),
    [start, setStart] = useState("1"),
    [price, setPrice] = useState("");
  const [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState<unknown>();
  const request = useRef(crypto.randomUUID());
  const dirty =
    count !== "8" || start !== "1" || !!price || uncertain || pending;
  useStayDraft(dirty);
  const valid =
    Number.isInteger(Number(count)) &&
    Number(count) >= 1 &&
    Number(count) <= 100 &&
    start.trim().length > 0 &&
    start.trim().length <= 56 &&
    (Number(count) === 1 || /(?:^|[^0-9])[0-9]{1,9}$/.test(start.trim())) &&
    (!price || validStayPrice(price));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !writable || disabled || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await createBeds(
        event.id,
        roomId,
        request.current,
        Number(count),
        start.trim(),
        price || null,
      );
      await qc.invalidateQueries({ queryKey: ["event", event.id] });
      onClose();
    } catch (e) {
      setError(e);
      if (["network", "unknown"].includes(errorCode(e))) setUncertain(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="card stay-action"
      onSubmit={submit}
      data-dirty={dirty}
      aria-label={t("bulkBeds")}
    >
      <h3>{t("bulkBeds")}</h3>
      <p>{t("bulkBedsHint")}</p>
      <div className="form-grid">
        <label>
          {t("bedCount")}
          <input
            type="number"
            min="1"
            max="100"
            value={count}
            disabled={pending || uncertain}
            onChange={(e) => setCount(e.target.value)}
            required
          />
        </label>
        <label>
          {t("startingCode")}
          <input
            value={start}
            maxLength={56}
            disabled={pending || uncertain}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </label>
        <label>
          {t("listedPrice")} · {event.base_currency}
          <input
            inputMode="decimal"
            value={price}
            disabled={pending || uncertain}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
      </div>
      {uncertain && <p className="notice">{t("bulkRetry")}</p>}
      {!!error && <ErrorState error={error} />}
      <div className="actions">
        <button
          className="primary"
          disabled={!valid || pending || !writable || disabled}
        >
          {t(pending ? "saving" : uncertain ? "retry" : "create")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!dirty || window.confirm(t("unsaved"))) onClose();
          }}
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
export function MoveStay({
  row,
  onClose,
  disabled = false,
}: {
  row: RecordRow;
  onClose: () => void;
  disabled?: boolean;
}) {
  const { event, writable } = useEvent(),
    { t } = useI18n(),
    qc = useQueryClient();
  const [bed, setBed] = useState(""),
    [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState<unknown>();
  const [warnings, setWarnings] = useState<
      Array<{ id: string; rule: string; label: string }>
    >([]),
    [reviewed, setReviewed] = useState(false);
  const request = useRef(crypto.randomUUID());
  useStayDraft(!!bed || pending || uncertain);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !writable ||
      disabled ||
      pending ||
      !bed ||
      bed === row.sleeping_place_id
    )
      return;
    setPending(true);
    setError(undefined);
    try {
      if (!reviewed && !uncertain) {
        const fields = encodeFields(
          "accommodation_assignment",
          initialFields("accommodation_assignment", row),
          row,
        );
        const found = await rpc<typeof warnings>("web_assignment_review", {
          p_event_id: event.id,
          p_kind: "accommodation_assignment",
          p_id: row.id,
          p_fields: {
            ...fields,
            sleeping_place_id: bed,
            start_date: event.start_date,
            end_date: event.end_date,
          },
        });
        if (found.length) {
          setWarnings(found);
          return;
        }
      }
      await moveStay(event.id, row, bed, request.current);
      await qc.invalidateQueries({ queryKey: ["event", event.id] });
      onClose();
    } catch (e) {
      setError(e);
      if (["network", "unknown"].includes(errorCode(e))) setUncertain(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="card stay-action"
      onSubmit={submit}
      data-dirty={!!bed || uncertain}
      aria-label={t("moveStay")}
    >
      <h3>{t("moveStay")}</h3>
      <p>{t("moveStayHint")}</p>
      <label htmlFor="move-bed">{t("sleepingPlace")}</label>
      <RelationPicker
        id="move-bed"
        kind="sleeping_place"
        value={bed}
        disabled={pending || uncertain}
        required
        onChange={(v) => {
          setBed(v);
          setWarnings([]);
          setReviewed(false);
        }}
      />
      {warnings.length > 0 && (
        <div className="notice warning">
          <ul>
            {warnings.map((w) => (
              <li key={w.id}>
                {t(w.rule)} · {w.label}
              </li>
            ))}
          </ul>
          <label>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            {t("override")}
          </label>
        </div>
      )}
      {uncertain && <p className="notice">{t("bulkRetry")}</p>}
      {!!error && <ErrorState error={error} />}
      <div className="actions">
        <button
          className="primary"
          disabled={
            pending ||
            !writable ||
            disabled ||
            !bed ||
            bed === row.sleeping_place_id ||
            (warnings.length > 0 && !reviewed)
          }
        >
          {t(pending ? "saving" : uncertain ? "retry" : "moveStay")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!bed || window.confirm(t("unsaved"))) onClose();
          }}
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
