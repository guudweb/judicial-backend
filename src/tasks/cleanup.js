import authService from "../services/auth.service.js";
import logger from "../utils/logger.js";

// Función para limpiar tokens expirados
export const cleanupExpiredTokens = async () => {
  try {
    await authService.cleanupExpiredTokens();
    logger.info("Limpieza de tokens completada");
  } catch (error) {
    logger.error("Error en limpieza de tokens", error);
  }
};

// Ejecutar limpieza cada 6 horas
export const startCleanupSchedule = () => {
  const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 horas en milisegundos

  setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL);

  // Ejecutar una vez al inicio
  cleanupExpiredTokens();

  logger.info("Programación de limpieza de tokens iniciada");
};
