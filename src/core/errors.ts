export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

const statusByCode: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  get status(): number {
    return statusByCode[this.code];
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError('BAD_REQUEST', message, details);
}
export function unauthorized(message = '请先登录'): AppError {
  return new AppError('UNAUTHORIZED', message);
}
export function forbidden(message = '没有权限执行此操作'): AppError {
  return new AppError('FORBIDDEN', message);
}
export function notFound(message = '资源不存在'): AppError {
  return new AppError('NOT_FOUND', message);
}
export function conflict(message: string): AppError {
  return new AppError('CONFLICT', message);
}
export function rateLimited(message = '请求过于频繁，请稍后再试'): AppError {
  return new AppError('RATE_LIMITED', message);
}
export function upstreamError(message: string, details?: unknown): AppError {
  return new AppError('UPSTREAM_ERROR', message, details);
}
