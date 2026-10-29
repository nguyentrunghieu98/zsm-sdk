"use strict";
/** Small helpers shared by the client and tests. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.asRecord = asRecord;
exports.asString = asString;
exports.asId = asId;
exports.asNumber = asNumber;
exports.asBoolean = asBoolean;
exports.parseJsonValue = parseJsonValue;
exports.toInternationalPhone = toInternationalPhone;
exports.parsePermissions = parsePermissions;
function asRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    return value;
}
function asString(value) {
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
function asId(value) {
    if (typeof value === 'string' && value.trim() !== '')
        return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return undefined;
}
function asNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
        return Number(value);
    return undefined;
}
function asBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    if (value === 0 || value === 1)
        return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1')
            return true;
        if (normalized === 'false' || normalized === '0')
            return false;
    }
    return undefined;
}
function parseJsonValue(value) {
    if (typeof value !== 'string')
        return value;
    const trimmed = value.trim();
    if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '['))
        return value;
    try {
        return JSON.parse(trimmed);
    }
    catch {
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
function toInternationalPhone(input) {
    const digits = input.replace(/[^\d+]/g, '');
    if (/^\+84\d{9}$/.test(digits))
        return digits;
    if (/^84\d{9}$/.test(digits))
        return `+84${digits.slice(2)}`;
    if (/^0\d{9}$/.test(digits))
        return `+84${digits.slice(1)}`;
    if (/^\d{9}$/.test(digits))
        return `+84${digits}`;
    return digits || input.trim();
}
function parsePermissions(value) {
    const parsed = parseJsonValue(value);
    if (Array.isArray(parsed))
        return parsed.map((item) => String(item));
    if (typeof parsed === 'string' && parsed.trim() !== '')
        return [parsed];
    return [];
}
