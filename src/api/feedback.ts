import { apiRequest } from "./client";

export async function sendFeedback(traceId: string, rating: 1 | -1): Promise<void> {
  await apiRequest("/feedback", {
    method: "POST",
    body: JSON.stringify({ trace_id: traceId, rating }),
    headers: { "Content-Type": "application/json" },
  });
}

export async function verifyClaims(answer: string, citationChunkIds: string[]): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>("/verify/claims", {
    method: "POST",
    body: JSON.stringify({ answer, citation_chunk_ids: citationChunkIds }),
    headers: { "Content-Type": "application/json" },
  });
}
