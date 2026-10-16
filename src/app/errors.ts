import { API_CODE, STATUS_CODE } from '../config/http';

/** HTTP 応答に写す業務上のエラー。status と code は応答形式を決める。 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(STATUS_CODE.NOT_FOUND, API_CODE.NOT_FOUND, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = API_CODE.CONFLICT) {
    super(STATUS_CODE.CONFLICT, code, message);
    this.name = 'ConflictError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(STATUS_CODE.INTERNAL_ERROR, API_CODE.CONFIGURATION_ERROR, message);
    this.name = 'ConfigurationError';
  }
}
