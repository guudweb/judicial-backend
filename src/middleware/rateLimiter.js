import rateLimit from "express-rate-limit";
import { AppError } from "./errorHandler.js";

// Rate limiter general
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 requests por ventana por IP
  message: {
    success: false,
    message:
      "Demasiadas solicitudes desde esta IP, intente de nuevo más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter estricto para autenticación
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // solo 5 intentos de login por IP cada 15 minutos
  message: {
    success: false,
    message:
      "Demasiados intentos de inicio de sesión, intente de nuevo en 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // no contar requests exitosos
});

// Rate limiter para operaciones sensibles
export const sensitiveOperationsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 3, // solo 3 operaciones sensibles cada 5 minutos
  message: {
    success: false,
    message: "Demasiadas operaciones sensibles, intente de nuevo más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para uploads
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 10, // máximo 10 uploads cada 10 minutos
  message: {
    success: false,
    message: "Demasiadas cargas de archivos, intente de nuevo más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para contacto público
export const publicContactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 mensajes por hora por IP
  message: {
    success: false,
    message: "Demasiados mensajes enviados, intente de nuevo en una hora.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
