import { z } from 'zod';

export const startRenderSchema = z.object({
  projectId: z.string().min(1),
  scriptId: z.string().min(1),
  userId: z.string().min(1),
  avatarId: z.string().optional(),
  voiceId: z.string().optional(),
  style: z.string().optional(),
  aspectRatio: z.enum(['9:16', '1:1', '16:9']).default('9:16'),
});

export type StartRenderParsed = z.infer<typeof startRenderSchema>;
