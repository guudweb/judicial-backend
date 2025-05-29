import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/roleCheck.js";
import { audit, auditHelpers } from "../middleware/audit.js";
import {
  validate,
  validateQuery,
  paginationSchema,
} from "../utils/validators.js";
import { z } from "zod";
import {
  create,
  update,
  toggleStatus,
  getById,
  getList,
  getStatistics,
  getTree,
  reorder,
  getPublicList,
} from "../controllers/departments.controller.js";
import { DEPARTMENT_TYPES } from "../utils/constants.js";

const router = express.Router();

// Esquemas de validación
const createDepartmentSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  type: z.enum(Object.values(DEPARTMENT_TYPES)),
  parentId: z.string().nullable().optional(),
  location: z.string().optional(),
  orderIndex: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateDepartmentSchema = createDepartmentSchema.partial();

const reorderSchema = z.object({
  orders: z.array(
    z.object({
      id: z.string(),
      orderIndex: z.number(),
    })
  ),
});

// Ruta pública para obtener departamentos activos (para selects)
router.get("/public", asyncHandler(getPublicList));

// Rutas que requieren autenticación
router.use(authenticate);

// Listar departamentos (con más detalles para usuarios autenticados)
router.get("/", validateQuery(paginationSchema), asyncHandler(getList));

// Obtener árbol jerárquico
router.get("/tree", asyncHandler(getTree));

// Estadísticas (requiere permisos)
router.get(
  "/statistics",
  requirePermission("departments.view_stats"),
  asyncHandler(getStatistics)
);

// Ver detalle
router.get("/:id", asyncHandler(getById));

// Rutas que requieren permisos de gestión
router.use(requirePermission("departments.manage"));

// Crear departamento
router.post(
  "/",
  validate(createDepartmentSchema),
  audit("department.create", (req, res, body) => ({
    type: "department",
    id: body?.data?.id,
    newValues: { name: req.body.name, type: req.body.type },
  })),
  asyncHandler(create)
);

// Actualizar departamento
router.put(
  "/:id",
  validate(updateDepartmentSchema),
  audit("department.update", (req, res, body) => ({
    type: "department",
    id: req.params.id,
    oldValues: body?.data?.oldValues,
    newValues: req.body,
  })),
  asyncHandler(update)
);

// Cambiar estado (activar/desactivar)
router.post(
  "/:id/toggle-status",
  audit("department.toggle_status", (req, res, body) => ({
    type: "department",
    id: req.params.id,
    newValues: { isActive: body?.data?.isActive },
  })),
  asyncHandler(toggleStatus)
);

// Reordenar departamentos
router.post(
  "/reorder",
  validate(reorderSchema),
  audit("department.reorder", (req) => ({
    type: "department_batch",
    id: "batch_reorder",
    newValues: { count: req.body.orders.length },
  })),
  asyncHandler(reorder)
);

export default router;
