import logger from "../utils/logger.js";

export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message } = err;

  logger.error("Error handler middleware", err, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userId: req.user?.id,
  });

  // Errores de Zod (validación)
  if (err.name === "ZodError") {
    statusCode = 400;
    message = "Datos de entrada inválidos";
    const errors = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));

    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }

  // Error de JWT
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Token inválido";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expirado";
  }

  // Error de base de datos
  if (err.code === "SQLITE_CONSTRAINT" && err.message.includes("UNIQUE")) {
    statusCode = 409;
    message = "El registro ya existe";
  }

  // Enviar respuesta
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export const notFound = (req, res, next) => {
  const error = new AppError(`Ruta no encontrada - ${req.originalUrl}`, 404);
  next(error);
};
