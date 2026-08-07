export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: '请求的资源不存在'
    }
  });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  const status = error.status || 500;
  const code = error.code || 'INTERNAL_ERROR';

  if (status >= 500) {
    console.error(error);
  }

  response.status(status).json({
    error: {
      code,
      message: status >= 500 ? '服务器暂时无法处理该请求' : error.message,
      details: error.details
    }
  });
}
