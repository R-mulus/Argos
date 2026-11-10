import type { ErrorRequestHandler, RequestHandler } from 'express';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code = 'BAD_REQUEST') {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, 'Rota não encontrada.', 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido.' } });
    return;
  }
  const dbCode = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code) : undefined;
  if (dbCode === '23505' || dbCode === '23P01') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'Registro duplicado ou período de vínculo conflitante.' } });
    return;
  }
  if (dbCode === '23503' || dbCode === '23514' || dbCode === '22P02' || dbCode === '22007') {
    res.status(422).json({ error: { code: 'INVALID_DATA', message: 'Dados incompatíveis com as regras do banco.' } });
    return;
  }
  if (dbCode === '42501') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Operação não autorizada.' } });
    return;
  }
  console.error('Erro não tratado:', error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } });
};
