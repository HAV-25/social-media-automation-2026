import { z } from "zod";

const recoveredRunsSchema = z.array(z.uuid()).max(50);

export function parseDemoRecoveredRuns(value: string | undefined) {
  if (!value) return [];
  try {
    return recoveredRunsSchema.parse(JSON.parse(value));
  } catch {
    return [];
  }
}

export function serializeDemoRecoveredRuns(runIds: string[]) {
  return JSON.stringify(recoveredRunsSchema.parse([...new Set(runIds)].slice(-50)));
}
