// src/routes/notifications.routes.js
import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import {
  validate,
  validateQuery,
  paginationSchema,
} from "../utils/validators.js";
import { z } from "zod";
import {
  getList,
  getById,
  markAsRead,
  markMultipleAsRead,
  deleteNotification,
  getUnreadCount,
  updatePreferences,
} from "../controllers/notifications.controller.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Listar notificaciones
router.get(
  "/",
  validateQuery(
    paginationSchema.extend({
      status: z.enum(["unread", "read", "all"]).optional(),
      type: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
  ),
  asyncHandler(getList)
);

// Contador de no leídas
router.get("/unread-count", asyncHandler(getUnreadCount));

// Ver detalle de notificación
router.get("/:id", asyncHandler(getById));

// Marcar como leída
router.put("/:id/read", asyncHandler(markAsRead));

// Marcar varias como leídas
router.put(
  "/read-multiple",
  validate(
    z.object({
      ids: z.array(z.string()).min(1, "Debe proporcionar al menos un ID"),
    })
  ),
  asyncHandler(markMultipleAsRead)
);

// Actualizar preferencias
router.put(
  "/preferences",
  validate(
    z.object({
      emailNotifications: z.boolean().optional(),
      notificationTypes: z.array(z.string()).optional(),
    })
  ),
  asyncHandler(updatePreferences)
);

// Eliminar notificación (soft delete)
router.delete("/:id", asyncHandler(deleteNotification));

export default router;
