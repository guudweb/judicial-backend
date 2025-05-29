import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { requirePermission, requireAnyRole } from "../middleware/roleCheck.js";
import { audit, auditHelpers } from "../middleware/audit.js";
import { uploadImage, handleMulterError } from "../config/multer.js";
import { getApprovalHistory } from "../controllers/news.controller.js";
import {
  validate,
  validateQuery,
  paginationSchema,
} from "../utils/validators.js";
import { z } from "zod";
import {
  create,
  update,
  remove,
  getById,
  getBySlug,
  getList,
  getPublicList,
  submitToDirector,
  approveByDirector,
  approveByPresident,
  reject,
  getStatistics,
  submitFromCourt,
} from "../controllers/news.controller.js";
import { ROLES, NEWS_TYPES } from "../utils/constants.js";

const router = express.Router();

// Esquema de validación actualizado
const createNewsSchema = z.object({
  title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
  subtitle: z.string().optional(),
  content: z.string().min(10, "El contenido debe tener al menos 10 caracteres"),
  type: z.enum(Object.values(NEWS_TYPES)),
});

// Rutas públicas
router.get(
  "/public",
  optionalAuth,
  validateQuery(paginationSchema),
  asyncHandler(getPublicList)
);

router.get("/public/slug/:slug", asyncHandler(getBySlug));

// Rutas que requieren autenticación
router.use(authenticate);

// Listar noticias (internas)
router.get("/", validateQuery(paginationSchema), asyncHandler(getList));

// Estadísticas
router.get("/statistics", asyncHandler(getStatistics));

// Ver detalle de noticia
router.get("/:id", asyncHandler(getById));

// Ver historial de aprobación de noticia
router.get("/:id/history", asyncHandler(getApprovalHistory));

// Crear noticia con imagen opcional
router.post(
  "/",
  requirePermission("news.create"),
  uploadImage.single("image"),
  handleMulterError,
  validate(createNewsSchema),
  audit("news.create", auditHelpers.news),
  asyncHandler(create)
);

// Envío de avisos/comunicados desde juzgados con imagen opcional
router.post(
  "/court-submission",
  requireAnyRole([ROLES.JUEZ, ROLES.PRESIDENTE_AUDIENCIA]),
  uploadImage.single("image"),
  handleMulterError,
  validate(
    z.object({
      title: z.string().min(5),
      subtitle: z.string().optional(),
      content: z.string().min(10),
      type: z.enum(["aviso", "comunicado"]),
      attachmentUrl: z.string().optional(),
    })
  ),
  audit("news.create", auditHelpers.news),
  asyncHandler(submitFromCourt)
);

// Actualizar noticia con imagen opcional
router.put(
  "/:id",
  uploadImage.single("image"),
  handleMulterError,
  validate(
    z.object({
      title: z.string().min(5).optional(),
      subtitle: z.string().optional(),
      content: z.string().min(10),
      removeImage: z.boolean().optional(),
    })
  ),
  audit("news.update", auditHelpers.news),
  asyncHandler(update)
);

// Crear noticia (técnicos y director de prensa)
router.post(
  "/",
  requirePermission("news.create"),
  validate(createNewsSchema),
  audit("news.create", auditHelpers.news),
  asyncHandler(create)
);

// Envío de avisos/comunicados desde juzgados
router.post(
  "/court-submission",
  requireAnyRole([ROLES.JUEZ, ROLES.PRESIDENTE_AUDIENCIA]),
  validate(
    z.object({
      title: z.string().min(5),
      content: z.string().min(10),
      type: z.enum(["aviso", "comunicado"]),
      attachmentUrl: z.string().optional(),
    })
  ),
  audit("news.create", auditHelpers.news),
  asyncHandler(submitFromCourt)
);

// Actualizar noticia
router.put(
  "/:id",
  validate(
    z.object({
      title: z.string().min(5),
      content: z.string().min(10),
    })
  ),
  audit("news.update", auditHelpers.news),
  asyncHandler(update)
);

// Eliminar noticia
router.delete(
  "/:id",
  audit("news.delete", auditHelpers.news),
  asyncHandler(remove)
);

// Flujo de aprobación
router.post(
  "/:id/submit-to-director",
  audit("news.submit", auditHelpers.news),
  asyncHandler(submitToDirector)
);

router.post(
  "/:id/approve-director",
  requirePermission("news.approve_director"),
  validate(z.object({ comments: z.string().optional() })),
  audit("news.approve", auditHelpers.news),
  asyncHandler(approveByDirector)
);

router.post(
  "/:id/approve-president",
  requirePermission("news.approve_president"),
  validate(z.object({ comments: z.string().optional() })),
  audit("news.approve", auditHelpers.news),
  asyncHandler(approveByPresident)
);

router.post(
  "/:id/reject",
  validate(
    z.object({
      comments: z.string().min(1, "Los comentarios son obligatorios"),
    })
  ),
  audit("news.reject", auditHelpers.news),
  asyncHandler(reject)
);

export default router;
