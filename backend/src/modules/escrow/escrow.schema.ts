import { z } from 'zod';

export const createEscrowSchema = z
  .object({
    projectName: z.string().min(1).max(256),
    description: z.string().max(4096).optional(),
    freelancerWallet: z.string().min(48).max(67),
    employerWallet: z.string().min(48).max(67).optional(),
    role: z.enum(['employer', 'freelancer']).default('employer'),
    amount: z.string().regex(/^\d+$/, 'Must be nanotons as string'),
    deadlineDays: z.number().int().min(1).max(365).optional(),
    deadline: z.number().int().positive().optional(), // unix timestamp (seconds)
  })
  .refine((d) => d.deadline !== undefined || d.deadlineDays !== undefined, {
    message: 'Provide either deadline (unix sec) or deadlineDays',
  })
  .refine((d) => d.role !== 'freelancer' || d.employerWallet !== undefined, {
    message: 'employerWallet is required when role is freelancer',
  });

export type CreateEscrowInput = z.infer<typeof createEscrowSchema>;

export const createEscrowBodySchema = z
  .object({
    project_name: z.string().min(1).max(256),
    freelancer_wallet: z.string().min(48).max(67),
    employer_wallet: z.string().min(48).max(67).optional(),
    role: z.enum(['employer', 'freelancer']).optional().default('employer'),
    amount: z.string().regex(/^\d+$/, 'Must be nanotons as string'),
    deadline: z.number().int().positive(), // unix timestamp (seconds)
  })
  .transform((data) => ({
    projectName: data.project_name,
    freelancerWallet: data.freelancer_wallet,
    amount: data.amount,
    deadline: data.deadline,
    role: data.role,
    ...(data.employer_wallet ? { employerWallet: data.employer_wallet } : {}),
  }))
  .refine((d) => d.role !== 'freelancer' || d.employerWallet !== undefined, {
    message: 'employer_wallet is required when role is freelancer',
  });

export type CreateEscrowBodyInput = z.input<typeof createEscrowBodySchema>;

export const escrowIdParams = z.object({
  id: z.string().uuid(),
});

export const listEscrowsQuery = z.object({
  role: z.enum(['employer', 'freelancer', 'arbiter']).optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListEscrowsQuery = z.infer<typeof listEscrowsQuery>;

export const submitWorkSchema = z.object({
  workHash: z.string().min(1),
});

export const recordDeploySchema = z.object({
  contractAddress: z.string().min(48),
  deployTxHash: z.string().min(1),
});
