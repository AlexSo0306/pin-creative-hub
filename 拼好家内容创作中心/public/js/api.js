export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`/api${path}`, {
    ...options,
    headers
  });

  if (response.status === 204) return null;

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(body.error?.message || '请求失败', {
      status: response.status,
      code: body.error?.code,
      details: body.error?.details
    });
  }

  return body.data ?? body;
}
