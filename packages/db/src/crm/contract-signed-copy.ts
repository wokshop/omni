import { eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import { crmContracts } from "../schema/crm.ts";
import { memberStorage } from "../storage.ts";
import { wasSigned } from "./contract-status.ts";
import {
  contractColumns,
  contractEvent,
  loadContract,
  lockRecords,
  usableDocument,
  withProgress,
  type ContractResult,
  type ContractSignedBy,
} from "./contracts.ts";
import { NOT_FOUND, refuse, type CrmMember, type Ex } from "./core.ts";
import { cleanName } from "./records.ts";

export interface SignedCopyInput {
  /** The executed PDF, a file in Shared. */
  nodeId: string;
  /** When it was signed; now when left out, or the recorded date on a contract already signed. */
  signedAt?: Date;
  signers: ContractSignedBy[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const invalid = (param: string) => ({ status: "invalid_contract" as const, param });

function signersOf(input: ContractSignedBy[]) {
  const signers: ContractSignedBy[] = [];
  for (const signer of input) {
    const name = cleanName(signer.name);
    if (!name) return null;
    const email = signer.email?.trim().toLowerCase() || null;
    signers.push({ name, email });
  }
  return signers;
}

/**
 * Records a contract signed outside Omni (a client's portal, paper, another e-signature
 * service): its executed copy becomes the signed copy, locked, with who signed and when. A draft
 * or a contract sent by hand becomes `signed`; a contract marked signed without its copy takes
 * one. A contract out for signature from Omni refuses (`signature_open`), as does one that
 * already has its signed copy (`contract_signed`).
 */
export const recordSignedCopy: (
  tx: Ex,
  member: CrmMember,
  id: string,
  input: SignedCopyInput,
) => Promise<ContractResult> = async (tx, member, id, input) => {
  const seen = await loadContract(tx, member.orgId, id);
  if (!seen || !(await lockRecords(tx, member.orgId, seen))) return NOT_FOUND;
  const current = await loadContract(tx, member.orgId, id, true);
  if (!current) return NOT_FOUND;
  if (current.status === "sent" && current.signatureRequestId) return { status: "signature_open" };
  if (current.signedNodeId) return { status: "contract_signed" };
  const now = new Date();
  if (input.signedAt && input.signedAt.getTime() > now.getTime() + DAY_MS) {
    return invalid("signedAt");
  }
  const signers = signersOf(input.signers);
  if (!signers) return invalid("signers");
  if (!(await usableDocument(tx, member, input.nodeId))) return invalid("nodeId");
  const signing = !wasSigned(current.status);
  const documentNodeId = current.documentNodeId ?? input.nodeId;
  const [contract] = await tx
    .update(crmContracts)
    .set({
      status: signing ? "signed" : current.status,
      signedAt: input.signedAt ?? (signing ? now : current.signedAt),
      documentNodeId,
      signedNodeId: input.nodeId,
      signedBy: signers,
    })
    .where(eq(crmContracts.id, id))
    .returning(contractColumns);
  const storage = memberStorage(tx as Db, member.id);
  for (const nodeId of new Set([documentNodeId, input.nodeId])) {
    const locked = await storage.lock(nodeId);
    if (locked.status !== "ok" || locked.node.space !== "shared") refuse(invalid("nodeId"));
  }
  const copy = { signedNodeId: input.nodeId, signers, elsewhere: true };
  if (signing) {
    await contractEvent(tx, member, contract!, "contract_status_changed", {
      from: current.status,
      to: "signed",
      ...copy,
    });
  } else {
    await contractEvent(tx, member, contract!, "contract_document_changed", {
      from: current.documentNodeId,
      to: documentNodeId,
      ...copy,
    });
  }
  return { status: "ok", contract: await withProgress(tx, member.orgId, contract!) };
};
