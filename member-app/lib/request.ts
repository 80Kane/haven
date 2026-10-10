import type { AppConfig } from "./config";
export async function readForm(
  request: Request,
  config: AppConfig,
  allowed: string[],
): Promise<URLSearchParams | null> {
  const url = new URL(request.url);
  if (
    request.method !== "POST" ||
    url.origin !== config.origin ||
    url.search ||
    request.headers.get("origin") !== config.origin ||
    !/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(
      request.headers.get("content-type") || "",
    ) ||
    Number(request.headers.get("content-length") || 0) > 4096
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return allowed.length === 0 ? new URLSearchParams() : null;
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.byteLength;
    }
    const form = new URLSearchParams(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (
      [...form.keys()].some(
        (key) => !allowed.includes(key) || form.getAll(key).length !== 1,
      )
    )
      return null;
    return form;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
