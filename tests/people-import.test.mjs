import assert from "node:assert/strict";
import test from "node:test";
import { describeProblems, MAX_IMPORT_ROWS, parseCsv, parsePeopleImport } from "../lib/people/import.ts";

test("parses quoted fields, escaped quotes and Windows line endings", () => {
  assert.deepEqual(parseCsv('"Mensah, Ama",ama@example.com\r\n"Kofi ""KB"" Boateng",,0241234567\r\n'), [
    ["Mensah, Ama", "ama@example.com"],
    ['Kofi "KB" Boateng', "", "0241234567"],
  ]);
});

test("skips a header row and blank lines", () => {
  const { people, problems } = parsePeopleImport("Name,Email,Phone,Group\n\nAma Mensah,ama@example.com,,Science\n");
  assert.deepEqual(problems, []);
  assert.deepEqual(people, [{ name: "Ama Mensah", email: "ama@example.com", phone: "", group: "Science" }]);
});

test("normalizes phone numbers and lower-cases emails", () => {
  const { people } = parsePeopleImport("Kojo Asante,KOJO@Example.com,024 123 4567,Finance");
  assert.equal(people[0].email, "kojo@example.com");
  assert.equal(people[0].phone, "+233241234567");
});

test("accepts international phone numbers that start with a plus sign", () => {
  const { people, problems } = parsePeopleImport("Ama Mensah,,+233 24 123 4567,");
  assert.deepEqual(problems, []);
  assert.equal(people[0].phone, "+233241234567");
});

test("reports every invalid row with its row number", () => {
  const { people, problems } = parsePeopleImport([
    "name,email,phone,group",
    "Ama Mensah,ama@example.com,,",
    "A,a@example.com,,",
    "No Contact,,,",
    "Bad Email,not-an-email,,",
    "Bad Phone,,12,",
    "Copy Ama,AMA@example.com,,",
    "=HYPERLINK(\"x\"),x@example.com,,",
  ].join("\n"));
  assert.equal(people.length, 1);
  assert.deepEqual(problems.map((problem) => problem.row), [3, 4, 5, 6, 7, 8]);
  assert.match(problems[4].message, /repeats the email on row 2/);
});

test("rejects rows with extra columns, which usually mean an unquoted comma", () => {
  const { problems } = parsePeopleImport("Mensah, Ama,ama@example.com,,Science");
  assert.match(problems[0].message, /more than four columns/);
});

test("refuses imports above the row limit", () => {
  const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Person ${i},p${i}@example.com,,`).join("\n");
  const { people, problems } = parsePeopleImport(rows);
  assert.equal(people.length, 0);
  assert.equal(problems.length, 1);
});

test("summarizes the first problems in one sentence", () => {
  const summary = describeProblems([
    { row: 2, message: "needs the person's full name." },
    { row: 3, message: "needs the person's full name." },
    { row: 4, message: "needs the person's full name." },
    { row: 5, message: "needs the person's full name." },
  ]);
  assert.equal(summary, "Row 2 needs the person's full name. Row 3 needs the person's full name. Row 4 needs the person's full name. 1 more row needs attention.");
});
