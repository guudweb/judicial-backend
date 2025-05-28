import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { requireAnyRole } from "../middleware/roleCheck.js";
import { uploadBook, handleMulterError } from "../config/multer.js";
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
  remove,
  getById,
  getList,
  getPublicList,
  getDownloadUrl,
  getStatistics,
  getPopularTags,
} from "../controllers/books.controller.js";
import { ROLES, BOOK_TYPES } from "../utils/constants.js";

const router = express.Router();

// Esquema de validación
const createBookSchema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  description: z.string().optional(),
  author: z.string().min(3, "El autor debe tener al menos 3 caracteres"),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  type: z.enum(Object.values(BOOK_TYPES)),
});

// Rutas públicas
router.get(
  "/public",
  validateQuery(paginationSchema),
  asyncHandler(getPublicList)
);

router.get("/public/:id", asyncHandler(getById));

router.get("/public/:id/download", optionalAuth, asyncHandler(getDownloadUrl));

router.get("/tags/popular", asyncHandler(getPopularTags));

// Rutas que requieren autenticación
router.use(authenticate);

// Listar libros (interno)
router.get("/", validateQuery(paginationSchema), asyncHandler(getList));

// Estadísticas
router.get("/statistics", asyncHandler(getStatistics));

// Ver detalle
router.get("/:id", asyncHandler(getById));

// Crear libro - Solo ciertos roles
router.post(
  "/",
  requireAnyRole([
    ROLES.ADMIN,
    ROLES.SECRETARIO_GENERAL,
    ROLES.DIRECTOR_PRENSA,
    ROLES.JUEZ,
    ROLES.PRESIDENTE_AUDIENCIA,
  ]),
  uploadBook.fields([
    { name: "cover", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  handleMulterError,
  validate(createBookSchema),
  audit("book.create", (req, res, body) => ({
    type: "book",
    id: body?.data?.id,
    newValues: { title: req.body.title, type: req.body.type },
  })),
  asyncHandler(create)
);

// Actualizar libro
router.put(
  "/:id",
  uploadBook.fields([
    { name: "cover", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  handleMulterError,
  validate(createBookSchema.partial()),
  audit("book.update", (req, res, body) => ({
    type: "book",
    id: req.params.id,
    newValues: req.body,
  })),
  asyncHandler(update)
);

// Eliminar libro
router.delete(
  "/:id",
  audit("book.delete", (req) => ({
    type: "book",
    id: req.params.id,
  })),
  asyncHandler(remove)
);

// Descargar (requiere auth para tracking)
router.get("/:id/download", asyncHandler(getDownloadUrl));

export default router;
