/**
 * Keep React contexts and the mount root stable when Vite re-evaluates modules.
 * Production creates each value normally; no application records are stored here.
 */
export function developmentSingleton<T>(key: string, create: () => T): T {
  const hot = import.meta.hot;
  if (!hot?.data) return create();
  const values: Map<string, unknown> = (hot.data.values ??= new Map());
  if (!values.has(key)) values.set(key, create());
  return values.get(key) as T;
}
