// The one-time code in a sign-in or verification email, so a reader can copy it in one press.
// Pure and free of mailparser (`@omni/mail-core/verification-code`), for the web app and iOS.
//
// A wrong code is worse than none: the reader pastes it and the sign-in fails. So the message
// must talk about a code, and the code must be unambiguous: the only one alone on a line, or
// the one a sentence names ("your code is 123456"). Anything else returns null.

/** Codes sit at the top of the mail; footers and quoted history are noise. */
const SCAN_CHARS = 4000;

// "code" (English, French), "código" (Spanish, Portuguese), "codice" (Italian), OTP, passcode,
// one-time password/PIN. Not the codes nobody types into a sign-in form.
const KEYWORD_SOURCE =
  "(?<!\\b(?:zip|postal|area|country|promo|discount|coupon|error|status|source|qr|bar)\\s)" +
  "(?<![\\p{L}\\d])(?:code|c[oó]digo|codice|otp|passcode|one[- ]time (?:password|pin))(?![\\p{L}\\d])";
const KEYWORD = new RegExp(KEYWORD_SOURCE, "iu");

// 4 to 8 digits, or two groups of three ("123 456", "123-456").
const DIGITS = "\\d{3}[ -]\\d{3}|\\d{4,8}";
// Letters and digits in one or two groups ("G7K2QX", "WDJB-MJHT"); checked for a digit below.
const MIXED = "[A-Z0-9]{3,5}-[A-Z0-9]{3,5}|[A-Z0-9]{5,8}";
// Not part of a longer number, amount, date, address or reference.
const DIGITS_ALONE = `(?<![\\d#$€£:./,-])(${DIGITS})(?![\\d:/,-]|\\.\\d)`;

const STANDALONE_LINE = new RegExp(`^[ \\t>*_]*(${DIGITS}|${MIXED})[ \\t*_]*$`, "gm");
// "code: 123456", "code is 123456", "código es 123456", within one line.
const AFTER_KEYWORD = new RegExp(
  `${KEYWORD_SOURCE}[^\\d\\n]{0,40}?(?<![\\d#$€£./,-])(${DIGITS}|${MIXED})(?![\\p{L}\\d:/,-]|\\.\\d)`,
  "giu",
);
// "123456 is your verification code", "123456 es tu código".
const BEFORE_KEYWORD = new RegExp(
  `${DIGITS_ALONE} (?:is|es|est|é|è) [^\\d\\n]{0,40}?${KEYWORD_SOURCE}`,
  "giu",
);
const SUBJECT_DIGITS = new RegExp(DIGITS_ALONE, "g");

/**
 * The verification code a message carries, as the reader would type it (digit groups joined:
 * "123 456" is `123456`), or null when it has none or more than one candidate.
 */
export function verificationCode(message: { subject: string; text: string }): string | null {
  const text = message.text.slice(0, SCAN_CHARS);
  if (!KEYWORD.test(message.subject) && !KEYWORD.test(text)) return null;

  // A subject that names the code is the sender's own summary: "123456 is your Acme code".
  if (KEYWORD.test(message.subject)) {
    const inSubject = only(codes(message.subject.matchAll(SUBJECT_DIGITS)));
    if (inSubject) return inSubject;
  }
  // Alone on a line is how nearly every sender sets the code apart. Two different ones (a code
  // and a postcode in the footer) are settled by the sentence that names one, or not at all.
  const alone = codes(text.matchAll(STANDALONE_LINE));
  if (alone.length === 1) return alone[0] ?? null;
  const named = [
    ...codes(text.matchAll(AFTER_KEYWORD)),
    ...codes(text.matchAll(BEFORE_KEYWORD)),
  ].filter((code) => !isYear(code));
  return only(named);
}

/** Each match's code, normalized, once. Letter codes need a digit, or every heading is one. */
function codes(matches: Iterable<RegExpMatchArray>): string[] {
  const found = new Set<string>();
  for (const match of matches) {
    const raw = match[1];
    if (!raw || !/\d/.test(raw)) continue;
    found.add(/^[\d -]+$/.test(raw) ? raw.replace(/[ -]/g, "") : raw);
  }
  return [...found];
}

function only(found: readonly string[]): string | null {
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** "This code expires in 2026" names a year, not a code. */
function isYear(code: string) {
  return /^(?:19|20)\d\d$/.test(code);
}
