import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import {
  getPendingTasks,
  getSummary,
  getRecentActivity,
  getStatsByRole,
} from "../controllers/dashboard.controller.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener tareas pendientes
router.get("/pending-tasks", asyncHandler(getPendingTasks));

// Obtener resumen del dashboard
router.get("/summary", asyncHandler(getSummary));

// Obtener actividad reciente
router.get("/recent-activity", asyncHandler(getRecentActivity));

// Obtener estadísticas específicas por rol
router.get("/stats-by-role", asyncHandler(getStatsByRole));

export default router;
