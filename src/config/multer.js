import multer from "multer";
import path from "path";
import { AppError } from "../middleware/errorHandler.js";
import {
  validateFileContent,
  sanitizeFilename,
} from "../utils/fileValidation.js";

// Configuración de almacenamiento temporal
const storage = multer.memoryStorage();

// Validador mejorado que incluye validación de contenido
const createFileFilter = (allowedExtensions, allowedMimeTypes) => {
  return async (req, file, cb) => {
    try {
      // 1. Validación básica de extensión
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        return cb(
          new AppError(
            `Formato de archivo no permitido. Solo se aceptan: ${allowedExtensions.join(", ")}`,
            400
          ),
          false
        );
      }

      // 2. Validación básica de MIME type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new AppError("Tipo de archivo no válido", 400), false);
      }

      // 3. Sanitizar nombre del archivo
      file.originalname = sanitizeFilename(file.originalname);

      cb(null, true);
    } catch (error) {
      cb(error, false);
    }
  };
};

// Middleware para validar contenido después de la carga
const validateFileContentMiddleware = async (req, res, next) => {
  try {
    if (req.file) {
      await validateFileContent(req.file.buffer, req.file.originalname);
    }

    if (req.files) {
      // Para múltiples archivos
      if (Array.isArray(req.files)) {
        for (const file of req.files) {
          await validateFileContent(file.buffer, file.originalname);
        }
      } else {
        // Para archivos con nombres de campo específicos
        for (const fieldName in req.files) {
          const files = req.files[fieldName];
          for (const file of files) {
            await validateFileContent(file.buffer, file.originalname);
          }
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Filtro de archivos para documentos
const documentFilter = createFileFilter(
  [".pdf", ".doc", ".docx"],
  [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]
);

// Filtro de archivos para imágenes
const imageFilter = createFileFilter(
  [".jpg", ".jpeg", ".png", ".webp"],
  ["image/jpeg", "image/png", "image/webp"]
);

// Configuración para documentos
export const uploadDocument = multer({
  storage,
  fileFilter: documentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
});

// Configuración para imágenes
export const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
});

// Para compatibilidad con código existente
export const upload = uploadDocument;

// Middleware mejorado para manejar errores de Multer
export const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return next(
        new AppError("El archivo excede el tamaño máximo permitido", 400)
      );
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return next(new AppError("Demasiados archivos", 400));
    }
    return next(new AppError(`Error al cargar archivo: ${error.message}`, 400));
  }
  next(error);
};

// Configuración para libros (múltiples archivos)
export const uploadBook = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB para libros
    files: 2, // máximo 2 archivos (cover + file)
  },
  fileFilter: (req, file, cb) => {
    try {
      // Sanitizar nombre
      file.originalname = sanitizeFilename(file.originalname);

      // Para la portada
      if (file.fieldname === "cover") {
        const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
          return cb(
            new AppError(
              `Formato de imagen no permitido. Solo se aceptan: ${allowedExtensions.join(", ")}`,
              400
            ),
            false
          );
        }

        const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return cb(new AppError("Tipo de imagen no válido", 400), false);
        }
      }

      // Para el archivo del libro
      if (file.fieldname === "file") {
        const allowedExtensions = [".pdf", ".epub", ".doc", ".docx"];
        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
          return cb(
            new AppError(
              `Formato de archivo no permitido. Solo se aceptan: ${allowedExtensions.join(", ")}`,
              400
            ),
            false
          );
        }

        const allowedMimeTypes = [
          "application/pdf",
          "application/epub+zip",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return cb(new AppError("Tipo de archivo no válido", 400), false);
        }
      }

      cb(null, true);
    } catch (error) {
      cb(error, false);
    }
  },
});

// Exportar el middleware de validación de contenido
export { validateFileContentMiddleware };
