// Reads an XLSX in its own thread (ADR 0043 decision 7): SheetJS parses the workbook as data, and
// each visible sheet comes back as rows of the cells' displayed text. Formulas, styles, macros
// and embedded files are never read, and nothing here builds HTML.
import { read, utils } from "xlsx";
import type { SheetsRequest, SheetsResult } from "./storage-preview.ts";

/** An XLSX is a zip. SheetJS reads anything else as a text sheet, so anything else is refused. */
const isZip = (buffer: ArrayBuffer) => {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
};

function sheets({ buffer, rows, columns }: SheetsRequest): SheetsResult {
  if (!isZip(buffer)) return { error: true };
  const book = read(buffer, {
    type: "array",
    dense: true,
    // One more than shown, to know there were more.
    sheetRows: rows + 1,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
  });
  // 1 is hidden, 2 very hidden: a sheet the workbook keeps out of sight stays out of the preview.
  const hidden = new Set(
    (book.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name ?? ""),
  );
  return {
    sheets: book.SheetNames.filter((name) => !hidden.has(name)).map((name) => {
      const sheet = book.Sheets[name];
      const all = sheet
        ? utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" })
        : [];
      return {
        name,
        rows: all.slice(0, rows).map((row) => row.slice(0, columns).map(String)),
        partial: all.length > rows,
      };
    }),
  };
}

/** This module runs as a dedicated worker: its `postMessage` answers the page that started it. */
const reply: (result: SheetsResult) => void = (self as unknown as Worker).postMessage.bind(self);

self.addEventListener("message", (event: MessageEvent<SheetsRequest>) => {
  let result: SheetsResult;
  try {
    result = sheets(event.data);
  } catch {
    result = { error: true };
  }
  reply(result);
});
