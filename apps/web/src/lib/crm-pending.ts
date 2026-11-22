const PREFIX = "pending-";

const made = new Map<string, { id: string | null; ready: Promise<string> }>();
const settle = new Map<
  string,
  { resolve: (id: string) => void; reject: (error: unknown) => void }
>();

/** True for an id `pendingId` minted. */
export const isPendingId = (id: string) => id.startsWith(PREFIX);

/** A new pending id, for a create about to show its row. */
export function pendingId() {
  const id = `${PREFIX}${crypto.randomUUID()}`;
  let resolve!: (id: string) => void;
  let reject!: (error: unknown) => void;
  const ready = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  ready.catch(() => undefined);
  made.set(id, { id: null, ready });
  settle.set(id, { resolve, reject });
  return id;
}

/** The create behind `pending` answered with `id`. */
export function pendingMade(pending: string, id: string) {
  const entry = made.get(pending);
  if (entry) entry.id = id;
  settle.get(pending)?.resolve(id);
  settle.delete(pending);
}

/** The create behind `pending` failed: what waits on it fails too. */
export function pendingFailed(pending: string, error: unknown) {
  settle.get(pending)?.reject(error);
  settle.delete(pending);
  made.delete(pending);
}

/** The Worker's id for `id` if its create has answered, else `id` itself. */
export const currentId = (id: string) => made.get(id)?.id ?? id;

/** The Worker's id for `id`, once its create has answered; any other id as it is. */
export function settledId(id: string) {
  const entry = made.get(id);
  return entry ? (entry.id ? Promise.resolve(entry.id) : entry.ready) : Promise.resolve(id);
}
