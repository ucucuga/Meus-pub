import { z } from 'zod';

export const getUserParams = z.object({
  id: z.string().uuid(),
});

export const searchUsersQuery = z.object({
  username: z.string().min(1).optional(),
  telegramId: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SearchUsersQuery = z.infer<typeof searchUsersQuery>;
