import { badRequest } from '../../lib/errors';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return typeof param === 'string' ? param : '';
};

export function isValidUuid(id: string): boolean {
  return UUID_V4_REGEX.test(id);
}

export function validateUuidParam(id: string, paramName: string = 'id'): void {
  if (!isValidUuid(id)) {
    throw badRequest('VALIDATION_ERROR', `${paramName} must be a valid UUID`);
  }
}

export function parsePaginationParams(query: { page?: any; limit?: any }): { page: number; limit: number } {
  let page = 1;
  let limit = 50;

  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw badRequest('VALIDATION_ERROR', 'Page query parameter must be a positive integer');
    }
    page = parsedPage;
  }

  if (query.limit !== undefined) {
    const parsedLimit = parseInt(query.limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw badRequest('VALIDATION_ERROR', 'Limit query parameter must be between 1 and 100');
    }
    limit = parsedLimit;
  }

  return { page, limit };
}
