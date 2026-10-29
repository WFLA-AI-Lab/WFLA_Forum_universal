import { z } from 'zod';

export const idSchema = z.string().uuid().or(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/));
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).optional()
});
export const contentSchema = z.string().trim().min(1).max(10000);
export const chatMessageSchema = z.string().trim().min(1).max(2000);
export const chatClientSchema = z.string().trim().min(1).max(128);
export const titleSchema = z.string().trim().min(2).max(120);
export const realNameSchema = z.string().trim().regex(/^[\u4e00-\u9fa5]{2,10}$/, '真实姓名必须为2-10个中文字符');
export const studentNumberSchema = z.coerce
  .string()
  .trim()
  .regex(/^20\d{6}$/, '学号必须为8位数字，前4位为入学年份');
export const nicknameSchema = z.string()
  .trim()
  .regex(/^[\p{L}\p{N}_ .·-]{1,24}$/u, '昵称需为1-24个中英文字符、数字或常用符号');
export const avatarDataUrlSchema = z.string()
  .max(350_000, '头像处理后不得超过256KB')
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, '头像仅支持PNG、JPEG或WebP');
// Accept JSON numbers as well as strings: both the web form and API clients
// have historically sent this field in either representation.
export const enrollmentYearSchema = z.coerce
  .string()
  .trim()
  .regex(/^(20\d{2})$/, '入学年份必须为四位数字，例如 2026');
export const usernameSchema = z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/);
export const passwordSchema = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);
export const roleSchema = z.enum(['owner','admin','moderator','member','guest']);
export const userStatusSchema = z.enum(['pending','active','muted','banned','deleted']);
export const reportTargetTypeSchema = z.enum(['thread','post','user','message']);
export const reportStatusSchema = z.enum(['open','in_review','resolved','rejected']);
