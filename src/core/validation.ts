import { z } from 'zod';

export const idSchema = z.string().uuid().or(z.string().regex(/^[A-Za-z0-9_-]{8,64}$/));
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).optional()
});
export const contentSchema = z.string().trim().min(1).max(10000);
export const titleSchema = z.string().trim().min(2).max(120);
export const realNameSchema = z.string().trim().regex(/^[\u4e00-\u9fa5]{2,10}$/, '真实姓名必须为2-10个中文字符');
export const enrollmentYearSchema = z.string().regex(/^(20\d{2})$/);
export const usernameSchema = z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/);
export const passwordSchema = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);
export const roleSchema = z.enum(['owner','admin','moderator','member','guest']);
export const userStatusSchema = z.enum(['pending','active','muted','banned','deleted']);
export const reportTargetTypeSchema = z.enum(['thread','post','user']);
export const reportStatusSchema = z.enum(['open','in_review','resolved','rejected']);
