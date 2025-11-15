import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import {
  upload,
  handleMulterError,
  validateFileContentMiddleware,
} from "../config/multer.js";
import { audit, auditHelpers } from "../middleware/audit.js";
import { uploadLimiter } from "../middleware/rateLimiter.js";
import {
  uploadDocument,
  deleteDocument,
  getDocumentsByExpediente,
  getDocumentInfo,
  getSecureDownloadUrl,
  getStatistics,
} from "../controllers/documents.controller.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Subir documento a un expediente
router.post(
  "/upload/:expedienteId",
  uploadLimiter,
  upload.single("document"),
  handleMulterError,
  validateFileContentMiddleware,
  audit("document.upload", auditHelpers.document),
  asyncHandler(uploadDocument)
);

// Obtener documentos de un expediente
router.get("/expediente/:expedienteId", asyncHandler(getDocumentsByExpediente));

// Obtener información de un documento
router.get("/:id", asyncHandler(getDocumentInfo));

// Generar URL de descarga segura
router.get("/:id/download", asyncHandler(getSecureDownloadUrl));

// Eliminar documento
router.delete(
  "/:id",
  audit("document.delete", auditHelpers.document),
  asyncHandler(deleteDocument)
);

// Estadísticas de documentos
router.get("/stats/summary", asyncHandler(getStatistics));

export default router;
