// Connects a Google account from the command line, the way the web app's Connect button will
// (ADR 0023): `pnpm --filter @omni/mail google:connect -- --org <id> --owner <member email>`.
// It prints Google's consent URL, catches the redirect on a loopback port, and hands the code,
// signed, to the running mail service's `/google/connect`, which exchanges it and keeps the tokens.
//
// With `--refresh-token-to <file>` it exchanges the code itself and writes only the refresh token
// to that file (mode 600), never to the terminal: how the Gmail e2e test account gets its grant.
//
// The OAuth client must list `http://localhost:<port>/callback` as an authorized redirect URI.
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { GOOGLE_CONNECT_PATH, googleConnectResultSchema } from "@omni/contracts";
import { signRequest } from "@omni/crypto";
import { createDb, findMemberByEmail } from "@omni/db";
import { z } from "zod";
import { createGoogleOAuth, GOOGLE_SCOPE_PARAM } from "../providers/gmail.ts";

const USAGE = `Usage: google:connect --org <org id> --owner <member email> [--port 8790]
       google:connect --refresh-token-to <file> [--port 8790]

Needs GOOGLE_CLIENT_ID. Connecting also needs DATABASE_URL, MAIL_SERVICE_URL and
MAIL_SERVICE_HMAC_SECRET (a running mail service); --refresh-token-to needs GOOGLE_CLIENT_SECRET.`;

function fail(message: string): never {
  console.error(`google:connect: ${message}`);
  process.exit(1);
}

if (existsSync(".env")) process.loadEnvFile(".env");
const env = z
  .object({
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    DATABASE_URL: z.url().optional(),
    MAIL_SERVICE_URL: z.url().optional(),
    MAIL_SERVICE_HMAC_SECRET: z.string().min(32).optional(),
  })
  .safeParse(process.env);
if (!env.success) fail(`missing or invalid: ${env.error.issues.map((i) => i.path).join(", ")}`);

const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === "--" ? argv.slice(1) : argv,
  options: {
    org: { type: "string" },
    owner: { type: "string" },
    port: { type: "string", default: "8790" },
    "refresh-token-to": { type: "string" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
const tokenFile = values["refresh-token-to"];
if (!tokenFile && (!values.org || !values.owner)) fail(`missing arguments\n\n${USAGE}`);

const redirectUri = `http://localhost:${values.port}/callback`;
const state = randomBytes(16).toString("base64url");
const codeVerifier = randomBytes(48).toString("base64url");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: env.data.GOOGLE_CLIENT_ID,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: GOOGLE_SCOPE_PARAM,
  access_type: "offline",
  prompt: "consent",
  state,
  code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
  code_challenge_method: "S256",
}).toString();

const code = await new Promise<string>((resolve) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/callback") return void res.writeHead(404).end();
    const error = url.searchParams.get("error");
    const got = url.searchParams.get("code");
    if (url.searchParams.get("state") !== state || (!got && !error)) {
      return void res.writeHead(400).end("Unexpected request.");
    }
    res.writeHead(200, { "content-type": "text/plain" }).end("Done. Back to the terminal.");
    server.close();
    if (error || !got) fail(`Google said: ${error}`);
    resolve(got);
  });
  server.listen(Number(values.port), "127.0.0.1", () => {
    console.error(`Open this URL and allow access:\n\n${authUrl.toString()}\n`);
  });
});

if (tokenFile) {
  if (!env.data.GOOGLE_CLIENT_SECRET) fail("--refresh-token-to needs GOOGLE_CLIENT_SECRET");
  const grant = await createGoogleOAuth({
    clientId: env.data.GOOGLE_CLIENT_ID,
    clientSecret: env.data.GOOGLE_CLIENT_SECRET,
  }).exchangeCode({ code, redirectUri, codeVerifier });
  writeFileSync(tokenFile, grant.refreshToken, { mode: 0o600 });
  console.error(`refresh token for ${grant.email} written to ${tokenFile}`);
  process.exit(0);
}

const { DATABASE_URL, MAIL_SERVICE_URL, MAIL_SERVICE_HMAC_SECRET } = env.data;
if (!DATABASE_URL || !MAIL_SERVICE_URL || !MAIL_SERVICE_HMAC_SECRET) {
  fail("connecting needs DATABASE_URL, MAIL_SERVICE_URL and MAIL_SERVICE_HMAC_SECRET");
}
const { db, close } = createDb(DATABASE_URL, { onnotice: () => {} });
const ownerMemberId = await findMemberByEmail(db, values.org!, values.owner!).finally(close);
if (!ownerMemberId) fail(`no member with email ${values.owner} in org ${values.org}`);

const body = JSON.stringify({ orgId: values.org, ownerMemberId, code, redirectUri, codeVerifier });
const headers = await signRequest({
  secret: MAIL_SERVICE_HMAC_SECRET,
  method: "POST",
  path: GOOGLE_CONNECT_PATH,
  body,
  nonce: randomBytes(16).toString("hex"),
});
const response = await fetch(new URL(GOOGLE_CONNECT_PATH, MAIL_SERVICE_URL), {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body,
});
const json: unknown = await response.json().catch(() => null);
const result = googleConnectResultSchema.safeParse(json);
if (!response.ok || !result.success)
  fail(`mail service answered ${response.status}: ${JSON.stringify(json)}`);
process.stdout.write(`${JSON.stringify(result.data)}\n`);
