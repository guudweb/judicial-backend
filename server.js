import dotenv from "dotenv";
import app from "./src/app.js";
import logger from "./src/utils/logger.js";
import { startCleanupSchedule } from "./src/tasks/cleanup.js";

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 3000;

// Iniciar servidor
const server = app.listen(PORT, () => {
  logger.info(`Servidor corriendo en puerto ${PORT}`, {
    environment: process.env.NODE_ENV,
    port: PORT,
  });
  //Iniciar tareas programadas
  startCleanupSchedule();
});

// Manejo de errores no capturados
process.on("unhandledRejection", (err) => {
  logger.error("Error no manejado", err);
  server.close(() => {
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM recibido, cerrando servidor...");
  server.close(() => {
    logger.info("Servidor cerrado");
    process.exit(0);
  });
});
