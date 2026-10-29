/** Small helpers shared by the client and tests. */

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function asId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
}

export function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/**
 * Normalize a Vietnamese phone number to the international form used by the
 * workspace search endpoints: `0912345678` -> `+84912345678`.
 *
 * Unknown shapes are returned with whitespace and separators removed so callers
 * can still see what was searched.
 */
export function toInternationalPhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (/^\+84\d{9}$/.test(digits)) return digits;
  if (/^84\d{9}$/.test(digits)) return `+84${digits.slice(2)}`;
  if (/^0\d{9}$/.test(digits)) return `+84${digits.slice(1)}`;
  if (/^\d{9}$/.test(digits)) return `+84${digits}`;
  return digits || input.trim();
}

export function parsePermissions(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) return parsed.map((item) => String(item));
  if (typeof parsed === 'string' && parsed.trim() !== '') return [parsed];
  return [];
}
