// Input failed validation (bad name, invalid colorId, ...) — maps to HTTP 400.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Referenced habit/entry doesn't exist — maps to HTTP 404.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
