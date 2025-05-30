import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/roleCheck.js";
import { upload, handleMulterError } from "../config/multer.js";
import { publicContactLimiter } from "../middleware/rateLimiter.js";
import { strictCSRFProtection } from "../middleware/csrf.js";
import {
  validate,
  validateQuery,
  createContactSchema,
  paginationSchema,
} from "../utils/validators.js";
import { z } from "zod";
import {
  create,
  getById,
  getList,
  updateStatus,
  assign,
  respond,
  getStatistics,
} from "../controllers/contact.controller.js";
import { CONTACT_STATUS } from "../utils/constants.js";

const router = express.Router();

// Ruta pública para enviar mensajes
router.post(
  "/public",
  publicContactLimiter,
  strictCSRFProtection,
  upload.single("attachment"),
  handleMulterError,
  validate(createContactSchema),
  asyncHandler(create)
);

// Rutas que requieren autenticación
router.use(authenticate);
router.use(requirePermission("contact.view"));

// Listar mensajes
router.get("/", validateQuery(paginationSchema), asyncHandler(getList));

// Estadísticas
router.get("/statistics", asyncHandler(getStatistics));

// Ver detalle de mensaje
router.get("/:id", asyncHandler(getById));

// Actualizar estado
router.put(
  "/:id/status",
  validate(
    z.object({
      status: z.enum(Object.values(CONTACT_STATUS)),
    })
  ),
  asyncHandler(updateStatus)
);

// Asignar mensaje
router.post(
  "/:id/assign",
  requirePermission("contact.assign"),
  validate(
    z.object({
      userId: z.string().min(1, "El usuario es requerido"),
    })
  ),
  asyncHandler(assign)
);

// Responder mensaje
router.post(
  "/:id/respond",
  validate(
    z.object({
      response: z
        .string()
        .min(10, "La respuesta debe tener al menos 10 caracteres"),
    })
  ),
  asyncHandler(respond)
);

export default router;
