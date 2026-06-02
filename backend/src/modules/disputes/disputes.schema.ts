import { z } from 'zod';

const evidenceFileSchema = z.object({
  name: z.string().min(1).max(256),
  type: z.string().min(1).max(128),
  data: z.string().min(1),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

export const submitEvidenceSchema = z.object({
  escrowId: z.string().uuid(),
  reason: z.string().min(10).max(4096),
  files: z.array(evidenceFileSchema).max(10).optional().default([]),
});

export type SubmitEvidenceInput = z.infer<typeof submitEvidenceSchema>;

export const openDisputeSchema = z.object({
  escrowId: z.string().uuid(),
  reason: z.string().min(10).max(4096),
  evidence: z.record(z.unknown()).optional(),
});

export type OpenDisputeInput = z.infer<typeof openDisputeSchema>;

export const resolveDisputeSchema = z.object({
  winner: z.enum(['freelancer', 'employer']),
  resolution: z.string().min(1).max(4096),
});

export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

export const disputeIdParams = z.object({
  id: z.string().uuid(),
});

export const listDisputesQuery = z.object({
  escrowId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
