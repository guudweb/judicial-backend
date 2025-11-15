import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/roleCheck.js";
import { validateQuery, paginationSchema } from "../utils/validators.js";
import {
  getLogs,
  getUserActivity,
  getEntityHistory,
  getStatistics,
} from "../controllers/audit.controller.js";

const router = express.Router();

// Todas las rutas requieren autenticación y permisos
router.use(authenticate);
router.use(requirePermission("audit.view"));

// Obtener logs con filtros
router.get("/", validateQuery(paginationSchema), asyncHandler(getLogs));

// Obtener actividad de un usuario
router.get("/user/:userId", asyncHandler(getUserActivity));

// Obtener historial de una entidad
router.get("/entity/:entityType/:entityId", asyncHandler(getEntityHistory));

// Obtener estadísticas
router.get("/statistics", asyncHandler(getStatistics));

export default router;
