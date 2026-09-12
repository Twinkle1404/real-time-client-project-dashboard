export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const badRequest = (code: string, message: string): AppError => {
  return new AppError(400, code, message);
};

export const unauthorized = (code: string = 'UNAUTHORIZED', message: string = 'Authentication required'): AppError => {
  return new AppError(401, code, message);
};

export const forbidden = (code: string = 'FORBIDDEN', message: string = 'You do not have permission to access this resource'): AppError => {
  return new AppError(403, code, message);
};

export const notFound = (code: string = 'NOT_FOUND', message: string = 'Resource not found'): AppError => {
  return new AppError(404, code, message);
};

export const conflict = (code: string = 'CONFLICT', message: string = 'Resource conflict'): AppError => {
  return new AppError(409, code, message);
};
