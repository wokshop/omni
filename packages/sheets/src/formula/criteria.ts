import { compare, isError, parseNumber, Range, type Arg, type Value } from "./values.ts";

type Test = (value: Value) => boolean;

const OPERATOR = /^(<=|>=|<>|<|>|=)?(.*)$/s;

const wildcard = (pattern: string) =>
  new RegExp(
    `^${pattern
      .replaceAll(/[.+^${}()|[\]\\]/g, "\\$&")
      .replaceAll(/~\*/g, "\u0000")
      .replaceAll(/~\?/g, "\u0001")
      .replaceAll("*", ".*")
      .replaceAll("?", ".")
      .replaceAll("\u0000", "\\*")
      .replaceAll("\u0001", "\\?")}$`,
    "is",
  );

/** A test for `SUMIF`-style criteria: `5`, `">5"`, `"<>x"`, `"a*"`. */
export function criterion(arg: Arg) {
  const raw = arg instanceof Range ? (arg.rows[0]?.[0] ?? null) : arg;
  if (typeof raw === "number" || typeof raw === "boolean") return ((v) => v === raw) satisfies Test;
  if (raw === null || isError(raw)) return ((v) => v === raw) satisfies Test;
  const [, op = "", rest = ""] = OPERATOR.exec(raw)!;
  const number = parseNumber(rest);
  const target: Value =
    number ??
    (rest.toUpperCase() === "TRUE" ? true : rest.toUpperCase() === "FALSE" ? false : rest);
  if (op === "" || op === "=" || op === "<>") {
    const equal: Test =
      typeof target === "string"
        ? target === ""
          ? (v: Value) => v === null || v === ""
          : (
              (re) => (v: Value) =>
                typeof v === "string" && re.test(v)
            )(wildcard(target))
        : (v: Value) => v === target;
    return op === "<>" ? (((v) => !equal(v)) satisfies Test) : equal;
  }
  return ((v) => {
    if (v === null || isError(v) || typeof v !== typeof target) return false;
    const c = compare(v, target);
    return op === "<" ? c < 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : c >= 0;
  }) satisfies Test;
}
