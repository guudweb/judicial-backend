import multer from "multer";
import path from "path";
import { AppError } from "../middleware/errorHandler.js";

// Configuración de almacenamiento temporal
const storage = multer.memoryStorage();

// Filtro de archivos para documentos
const documentFilter = (req, file, cb) => {
  const allowedExtensions = [".pdf", ".doc", ".docx"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    return cb(
      new AppError(
        `Formato de archivo no permitido. Solo se aceptan: ${allowedExtensions.join(
          ", "
        )}`,
        400
      ),
      false
    );
  }

  const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new AppError("Tipo de archivo no válido", 400), false);
  }

  cb(null, true);
};

// Filtro de archivos para imágenes
const imageFilter = (req, file, cb) => {
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    return cb(
      new AppError(
        `Formato de imagen no permitido. Solo se aceptan: ${allowedExtensions.join(
          ", "
        )}`,
        400
      ),
      false
    );
  }

  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new AppError("Tipo de imagen no válido", 400), false);
  }

  cb(null, true);
};

// Configuración para documentos
export const uploadDocument = multer({
  storage,
  fileFilter: documentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Configuración para imágenes
export const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Para compatibilidad con código existente
export const upload = uploadDocument;

// Middleware para manejar errores de Multer
export const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return next(
        new AppError("El archivo excede el tamaño máximo permitido", 400)
      );
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
  },
  fileFilter: (req, file, cb) => {
    // Para la portada
    if (file.fieldname === "cover") {
      return imageFilter(req, file, cb);
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
  },
});
