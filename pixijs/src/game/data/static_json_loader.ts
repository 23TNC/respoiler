const jsonCache = new Map<string, unknown>();

export async function loadStaticJson<T>(path: string): Promise<T> {
  if (jsonCache.has(path)) {
    return jsonCache.get(path) as T;
  }

  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load static JSON from ${path}: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as T;
  jsonCache.set(path, payload);
  return payload;
}
