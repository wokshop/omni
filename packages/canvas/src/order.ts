const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;
const digit = (key: string, at: number) => DIGITS.indexOf(key[at]!);

/**
 * A fractional key for z-order after `before` and before `after` (`null` for no bound): a string
 * that sorts between the two, so moving one element in front of another never rewrites anyone
 * else's key. `before` must sort below `after`, and both must be keys this made. A key never ends
 * in the lowest digit, so there is always room below it.
 */
export function keyBetween(before: string | null, after: string | null) {
  const low = before ?? "";
  let high = after;
  let key = "";
  for (let at = 0; ; at++) {
    const a = at < low.length ? digit(low, at) : 0;
    const b = high === null ? BASE : at < high.length ? digit(high, at) : 0;
    if (a === b) {
      key += DIGITS[a];
      continue;
    }
    const middle = Math.floor((a + b) / 2);
    if (middle > a) return key + DIGITS[middle];
    key += DIGITS[a];
    high = null;
  }
}

/** Orders by key, then by id, so equal keys made at once still sort the same everywhere. */
export const byKey = (a: { z: string; id: string }, b: { z: string; id: string }) =>
  a.z < b.z ? -1 : a.z > b.z ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
