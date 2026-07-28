export type RssPollStatus = "Completed" | "Failed" | "Pending";

export function deriveRssPollStatus(input: {
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}): RssPollStatus {
  if (input.lastError) return "Failed";
  if (input.lastPolledAt && input.lastSuccessAt) return "Completed";
  return "Pending";
}
