import { describe, expect, test } from "vitest";
import { readGrid } from "./doc.ts";
import { toA1, toLive } from "./formula/translate.ts";
import { gridLayout } from "./doc.ts";
import { docOf, edit, firstTab, saved, values } from "./test-helpers.ts";

const result = (formula: string, rows: (string | number | boolean | null)[][] = []) => {
  const doc = docOf({ name: "T", rows: [...rows, [formula]] });
  const table = firstTab(doc);
  const value = table.at(-1)![0];
  return value instanceof Object && "code" in value ? (value as { code: string }).code : value;
};

describe("formulas that could break the evaluator or a total", () => {
  test("a formula nested too deep is an error in its cell, and the rest of the sheet evaluates", () => {
    const deep = `=${"1+".repeat(6_000)}1`;
    const doc = docOf({
      name: "T",
      rows: [[deep, "=1+1"], [`=${"(".repeat(200)}2${")".repeat(200)}`]],
    });
    expect(firstTab(doc)).toEqual([
      [expect.objectContaining({ code: "#NAME?" }), 2],
      [2, null],
    ]);
  });

  test("overflow and invalid arithmetic are #NUM!, which IFERROR catches", () => {
    expect(result("=EXP(1000)")).toBe("#NUM!");
    expect(result("=(-1)^0.5")).toBe("#NUM!");
    expect(result("=IFERROR(EXP(1000)*0, 7)")).toBe(7);
    expect(saved(docOf({ name: "T", rows: [["=EXP(1000)"]] })).text).toContain('"e":"#NUM!"');
  });

  test("an error in a cell a conditional total takes is the total's error", () => {
    const rows = [
      [1, "=1/0"],
      [2, 5],
      [-1, "=1/0"],
    ];
    expect(result('=SUMIF(A1:A3,">0",B1:B3)', rows)).toBe("#DIV/0!");
    expect(result('=SUMIF(A1:A3,">1",B1:B3)', rows)).toBe(5);
    expect(result('=AVERAGEIFS(B1:B3,A1:A3,">0")', rows)).toBe("#DIV/0!");
  });

  test("a range past the stored rows keeps its size: the rows after are blank", () => {
    const doc = docOf({ name: "T", rows: [[1, "=COUNTBLANK(A1:A10)", "=INDEX(A1:A10,10)"]] });
    expect(firstTab(doc)).toEqual([[1, 9, 0]]);
  });
});

describe("references by id", () => {
  test("a reference past the last row follows its cell once the row exists", () => {
    const doc = docOf({ name: "T", rows: [[1, "=A2"]] });
    edit(doc, { set: "A2", value: 5 }, { insert_rows: { before: 2 } });
    expect(firstTab(doc)).toEqual([
      [1, 5],
      [null, null],
      [5, null],
    ]);
    expect(saved(doc).text).toContain('"=A3"');
  });

  test("a formula keeps pointing at its cell after rows are inserted above it", () => {
    const doc = docOf({ name: "T", rows: [[10], [20], ["=A1+A2"]] });
    edit(doc, { insert_rows: { before: 1, count: 2 } }, { set: "A1:A2", values: [[1000], [2000]] });
    expect(firstTab(doc).at(-1)).toEqual([30]);
    expect(saved(doc).text).toContain('"=A3+A4"');
  });

  test("a reference to a deleted row is #REF!", () => {
    const doc = docOf({ name: "T", rows: [[10], [20], ["=A1+A2"]] });
    edit(doc, { delete_rows: "1" });
    expect(saved(doc).text).toContain('{"f":"=#REF!+A1","e":"#REF!"}');
  });

  test("references to an empty row survive a save", () => {
    const doc = docOf({ name: "T", rows: [[1], [], ["=A2+A1"]] });
    expect(saved(doc).text).toContain('"=A2+A1"');
  });

  test("A1 ↔ ids across tabs, with $ and quoted names", () => {
    const doc = docOf(
      {
        name: "Leads",
        rows: [
          [1, 2],
          [3, 4],
        ],
      },
      { name: "Q4 plan", rows: [[5]] },
    );
    const grid = readGrid(doc);
    const layout = gridLayout(grid);
    const home = grid.tabs[1]!.id;
    const formula = "=SUM(Leads!$A$1:B2)+'Q4 plan'!A1+A$1+SUM(Leads!A:A)";
    const live = toLive(formula, layout, home);
    expect(live).not.toContain("Leads");
    expect(toA1(live, layout, home)).toBe(formula);
    edit(doc, { tab: "Q4 plan", set: "B1", value: formula });
    expect(values(doc)[1]![0]).toEqual([5, 24]);
  });

  test("a cycle is #REF!, and what depends on it too", () => {
    const doc = docOf({ name: "T", rows: [["=B1", "=A1", "=A1+1"]] });
    expect(saved(doc).text.match(/#REF!/g)?.length).toBe(3);
  });

  test("fill down shifts relative references and keeps absolute ones", () => {
    const doc = docOf({ name: "T", rows: [[1, "=A1*$A$1"], [2], [3]] });
    edit(doc, { fill_down: "B1:B3" });
    expect(firstTab(doc).map((r) => r[1])).toEqual([1, 2, 3]);
    expect(saved(doc).text).toContain('"=A3*$A$1"');
  });
});

describe("functions, against Excel's results", () => {
  const data = [
    [1, "a"],
    [2, "b"],
    [3, "a"],
    [null, "c"],
  ];
  test.each([
    ["=1+2*3^2", 19],
    ["=-2^2", 4],
    ["=10%", 0.1],
    ['="a"&1&TRUE', "a1TRUE"],
    ["=1/0", "#DIV/0!"],
    ['=1+"x"', "#VALUE!"],
    ['=1+"2"', 3],
    ["=NOPE(1)", "#NAME?"],
    ["=SUM(A1:A4)", 6],
    ["=AVERAGE(A1:A4)", 2],
    ["=COUNT(A1:B4)", 3],
    ["=COUNTA(A1:B4)", 7],
    ["=COUNTBLANK(A1:A4)", 1],
    ["=MAX(A1:A4)-MIN(A1:A4)", 2],
    ["=ROUND(2.675, 2)", 2.68],
    ["=ROUNDDOWN(-2.5, 0)", -2],
    ["=MOD(-3, 2)", 1],
    ['=SUMIF(B1:B4, "a", A1:A4)', 4],
    ['=COUNTIF(A1:A4, ">1")', 2],
    ['=SUMIFS(A1:A4, B1:B4, "a", A1:A4, ">1")', 3],
    ['=AVERAGEIF(B1:B4, "<>b", A1:A4)', 2],
    ['=COUNTIF(B1:B4, "?")', 4],
    ['=IF(A1>0, "yes", 1/0)', "yes"],
    ['=IFERROR(1/0, "none")', "none"],
    ["=AND(TRUE, A1=1)", true],
    ["=OR(FALSE, A2>5)", false],
    ["=VLOOKUP(2, A1:B4, 2, FALSE)", "b"],
    ["=VLOOKUP(9, A1:B4, 2, FALSE)", "#N/A"],
    ['=XLOOKUP("c", B1:B4, A1:A4, "missing")', 0],
    ['=XLOOKUP("z", B1:B4, A1:A4, "missing")', "missing"],
    ['=MATCH("a", B1:B4, 0)', 1],
    ["=INDEX(A1:B4, 3, 2)", "a"],
    ['=LEFT("Omni", 2)&RIGHT("Omni")&MID("Omni", 2, 2)', "Omimn"],
    ['=LEN(TRIM("  a  b "))', 3],
    ['=UPPER("é")&LOWER("A")&PROPER("hello world")', "Éa" + "Hello World"],
    ['=SUBSTITUTE("a-b-c", "-", "+")', "a+b+c"],
    ['=TEXT(1234.5, "#,##0.00")', "1,234.50"],
    ['=TEXT(0.256, "0%")', "26%"],
    ["=DATE(2026, 11, 22)", 46348],
    ['=TEXT(DATE(2026,1,31), "yyyy-mm-dd")', "2026-01-31"],
    ["=EDATE(DATE(2026,1,31), 1)", 46081],
    ['=YEAR(46348)&"-"&MONTH(46348)&"-"&DAY(46348)', "2026-11-22"],
    ['=DATEDIF(DATE(2025,11,23), DATE(2026,11,22), "Y")', 0],
    ['=DATEDIF(DATE(2025,11,22), DATE(2026,11,22), "M")', 12],
    ["=NETWORKDAYS(DATE(2026,11,16), DATE(2026,11,22))", 5],
    ["=TODAY()", 46348],
    ["=NETWORKDAYS(DATE(2026,1,1), DATE(2026,12,31))", 261],
    ["=NETWORKDAYS(1e20, 1e20)", "#NUM!"],
    ['=REPT("x", 1000000000)', "#VALUE!"],
    ['=IF(FALSE, REPT("x", 1000000000), 1)', 1],
    ["=SUM(B1)", 0],
    [`=LEN(TEXT(1, "0.${"0".repeat(101)}"))`, 32],
    ["=SUM(B1, A1)", 1],
  ])("%s → %s", (formula, expected) => {
    expect(result(formula, data)).toEqual(expected);
  });

  test("a date column's ISO dates are serial numbers in formulas", () => {
    const doc = docOf({ name: "T", rows: [["2026-11-22", "=A1+1"]], columns: [{ type: "date" }] });
    expect(firstTab(doc)[0]).toEqual(["2026-11-22", 46349]);
  });
});
