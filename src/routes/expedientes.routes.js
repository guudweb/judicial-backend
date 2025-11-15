import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import {
  requirePermission,
  requireOwnershipOrRole,
} from "../middleware/roleCheck.js";
import { audit, auditHelpers } from "../middleware/audit.js";
import {
  validate,
  validateQuery,
  createExpedienteSchema,
  updateExpedienteSchema,
  paginationSchema,
  z,
} from "../utils/validators.js";
import {
  create,
  update,
  remove,
  getById,
  getList,
  submit,
  approve,
  reject,
  returnForRevision,
  getApprovalHistory,
  getStatistics,
} from "../controllers/expedientes.controller.js";
import { ROLES } from "../utils/constants.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas de lectura
router.get("/", validateQuery(paginationSchema), asyncHandler(getList));

router.get("/statistics", asyncHandler(getStatistics));

router.get("/:id", asyncHandler(getById));

router.get("/:id/history", asyncHandler(getApprovalHistory));

// Crear expediente (solo jueces)
router.post(
  "/",
  requirePermission("expedientes.create"),
  validate(createExpedienteSchema),
  audit("expediente.create", auditHelpers.expediente),
  asyncHandler(create)
);

// Actualizar expediente (creador o roles superiores)
router.put(
  "/:id",
  requireOwnershipOrRole("createdBy", [ROLES.ADMIN, ROLES.SECRETARIO_GENERAL]),
  validate(updateExpedienteSchema),
  audit("expediente.update", auditHelpers.expediente),
  asyncHandler(update)
);

// Eliminar expediente (creador o admin)
router.delete(
  "/:id",
  requireOwnershipOrRole("createdBy", [ROLES.ADMIN]),
  audit("expediente.delete", auditHelpers.expediente),
  asyncHandler(remove)
);

// Acciones del flujo de aprobación
router.post(
  "/:id/submit",
  requirePermission("expedientes.submit"),
  validate(z.object({ comments: z.string().optional() })),
  audit("expediente.submit", auditHelpers.expediente),
  asyncHandler(submit)
);

router.post(
  "/:id/approve",
  validate(z.object({ comments: z.string().optional() })),
  audit("expediente.approve", auditHelpers.expediente),
  asyncHandler(approve)
);

router.post(
  "/:id/reject",
  validate(
    z.object({
      comments: z.string().min(1, "Los comentarios son obligatorios"),
    })
  ),
  audit("expediente.reject", auditHelpers.expediente),
  asyncHandler(reject)
);

router.post(
  "/:id/return",
  validate(
    z.object({
      comments: z.string().min(1, "Los comentarios son obligatorios"),
    })
  ),
  audit("expediente.return", auditHelpers.expediente),
  asyncHandler(returnForRevision)
);

export default router;
