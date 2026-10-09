// Member import from a CSV file or pasted rows.
//
// Columns are: name, email, phone, group. A header row is detected and skipped.
// Quoted fields ("Mensah, Ama") and escaped quotes ("") follow RFC 4180.
// Every problem is reported with its row number so the owner can fix the file
// in one pass instead of discovering errors one at a time.

import { normalizeE164 } from "../sms/phone.ts";

export type ImportedPerson = { name: string; email: string; phone: string; group: string };
export type ImportProblem = { row: number; message: string };
export type ImportResult = { people: ImportedPerson[]; problems: ImportProblem[] };

export const MAX_IMPORT_ROWS = 5_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEADER_WORDS = new Set(["name", "full name", "fullname", "email", "e-mail", "phone", "telephone", "mobile", "group"]);

/** Cells starting with these characters can run as formulas when the file is reopened in a spreadsheet. */
export function isSafeCell(value: string) {
  return !/^[=+@-]/.test(value.trim());
}

/** Splits CSV text into rows of cells, honouring quotes, escaped quotes and CRLF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.trim() === "") { cell = ""; quoted = true; }
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((cells) => cells.map((value) => value.trim())).filter((cells) => cells.some(Boolean));
}

function isHeaderRow(cells: string[]) {
  return cells.filter((cell) => HEADER_WORDS.has(cell.toLowerCase())).length >= 2;
}

/** Validates and normalizes one person's cells: name, email, phone, group. */
export function checkPerson(cells: string[]): { person: ImportedPerson } | { problem: string } {
  const [name = "", rawEmail = "", rawPhone = "", group = ""] = cells.map((cell) => cell.trim());
  const email = rawEmail.toLowerCase();
  if (cells.length > 4) return { problem: "has more than four columns. Wrap names that contain commas in quotes." };
  // Phone numbers may start with "+"; they are validated as digits below, so they cannot carry a formula.
  if (![name, email, group].every(isSafeCell)) return { problem: "contains a value starting with =, +, - or @. Remove it before importing." };
  if (name.length < 2) return { problem: "needs the person's full name." };
  if (!email && !rawPhone) return { problem: "needs an email address or phone number." };
  if (email && !EMAIL.test(email)) return { problem: `has an invalid email address (${rawEmail}).` };
  let phone = "";
  if (rawPhone) {
    try { phone = normalizeE164(rawPhone); }
    catch { return { problem: `has an invalid phone number (${rawPhone}).` }; }
  }
  return { person: { name, email, phone, group } };
}

export function parsePeopleImport(text: string): ImportResult {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const start = rows.length && isHeaderRow(rows[0]) ? 1 : 0;
  const people: ImportedPerson[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Map<string, number>();

  if (rows.length - start > MAX_IMPORT_ROWS) {
    return { people, problems: [{ row: 0, message: `Import at most ${MAX_IMPORT_ROWS.toLocaleString()} people at a time.` }] };
  }

  rows.slice(start).forEach((cells, index) => {
    const row = index + start + 1;
    const checked = checkPerson(cells);
    if ("problem" in checked) return problems.push({ row, message: checked.problem });
    const { person } = checked;
    for (const key of [person.email && `email:${person.email}`, person.phone && `phone:${person.phone}`]) {
      if (!key) continue;
      const first = seen.get(key);
      if (first) return problems.push({ row, message: `repeats the ${key.split(":")[0]} on row ${first}.` });
    }
    if (person.email) seen.set(`email:${person.email}`, row);
    if (person.phone) seen.set(`phone:${person.phone}`, row);
    people.push(person);
  });

  return { people, problems };
}

/** One readable sentence for the first few problems, e.g. for an inline form error. */
export function describeProblems(problems: ImportProblem[], limit = 3) {
  const shown = problems.slice(0, limit).map((problem) => problem.row ? `Row ${problem.row} ${problem.message}` : problem.message);
  const rest = problems.length - shown.length;
  return shown.join(" ") + (rest > 0 ? ` ${rest} more ${rest === 1 ? "row needs" : "rows need"} attention.` : "");
}
