import { csvParse } from "d3-dsv";
import * as XLSX from "xlsx";

import type { UploadedFile } from "../common/types/upload-file.type.js";

export type TabularRow = Record<string, string>;

function normalizeHeaderKey(input: string): string {
  const withoutBom = input.replace(/^\uFEFF/, "");
  return withoutBom
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRow(raw: Record<string, unknown>): TabularRow {
  const normalized: TabularRow = {};
  for (const [key, value] of Object.entries(raw)) {
    const header = normalizeHeaderKey(String(key ?? ""));
    if (!header) {
      continue;
    }
    const cell = value === null || value === undefined ? "" : String(value);
    normalized[header] = cell.trim();
  }
  return normalized;
}

function isEmptyRow(row: TabularRow): boolean {
  return Object.values(row).every((value) => !value || !value.trim());
}

function parseCsv(file: UploadedFile): TabularRow[] {
  const text = file.buffer.toString("utf8");
  const parsed = csvParse(text);
  return parsed.map((row) => normalizeRow(row as Record<string, unknown>)).filter((row) => !isEmptyRow(row));
}

function parseExcel(file: UploadedFile): TabularRow[] {
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  const parsed = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, unknown>>;
  return parsed.map((row) => normalizeRow(row)).filter((row) => !isEmptyRow(row));
}

export function parseTabularUpload(file: UploadedFile): { rows: TabularRow[]; warnings: string[] } {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".csv")) {
    return { rows: parseCsv(file), warnings: [] };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return { rows: parseExcel(file), warnings: [] };
  }

  return {
    rows: [],
    warnings: [`Unsupported import file type: ${file.originalname}`],
  };
}

