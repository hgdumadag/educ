const DANGEROUS_PREFIX = /^[=+\-@]/;
const CONTROL_PREFIX = /^[\t\r\n]/;

export function sanitizeCsvCell(value: unknown): string {
  const stringValue = String(value ?? "");
  if (DANGEROUS_PREFIX.test(stringValue) || CONTROL_PREFIX.test(stringValue)) {
    return `'${stringValue}`;
  }

  return stringValue;
}

export function toCsvCell(value: unknown): string {
  return `"${sanitizeCsvCell(value).replaceAll('"', '""')}"`;
}
