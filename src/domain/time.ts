export const EVENT_TIME_ZONE = "Europe/Kyiv";

function zonedParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(\n    parts.map((part) => [part.type, part.value]),\n  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zoneOffsetMs(timestamp: number, timeZone: string) {
  const p = zonedParts(timestamp, timeZone);
  const representedAsUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return representedAsUtc - Math.floor(timestamp / 1000) * 1000;
}

export function civilMidnightUtc(
  civilDate: string,
  timeZone = EVENT_TIME_ZONE,
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(civilDate)) return null;
  const desiredLocal = Date.parse(civilDate + "T00:00:00Z");
  if (
    !Number.isFinite(desiredLocal) ||
    new Date(desiredLocal).toISOString().slice(0, 10) !== civilDate
  )
    return null;
  let target = desiredLocal;
  for (let i = 0; i < 3; i += 1) {
    target = desiredLocal - zoneOffsetMs(target, timeZone);
  }
  return target;
}

export interface CountdownParts {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function countdownToCivilDate(
  civilDate: string,
  now = Date.now(),
  timeZone = EVENT_TIME_ZONE,
): CountdownParts | null {
  const target = civilMidnightUtc(civilDate, timeZone);
  if (target === null) return null;
  const totalMs = Math.max(0, target - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}
