import { fileTypeFromBuffer } from "file-type";
import { AppError } from "../middleware/errorHandler.js";

// Tipos MIME permitidos y sus extensiones correspondientes
const ALLOWED_FILE_TYPES = {
  // Documentos
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/epub+zip": [".epub"],

  // Imágenes
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],

  // Texto plano (para casos específicos)
  "text/plain": [".txt"],
};

// Límites de tamaño por tipo
const SIZE_LIMITS = {
  "application/pdf": 50 * 1024 * 1024, // 50MB para PDFs
  "application/epub+zip": 50 * 1024 * 1024, // 50MB para EPUBs
  "application/msword": 25 * 1024 * 1024, // 25MB para DOCs
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    25 * 1024 * 1024, // 25MB para DOCXs
  "image/jpeg": 10 * 1024 * 1024, // 10MB para imágenes
  "image/png": 10 * 1024 * 1024,
  "image/webp": 10 * 1024 * 1024,
  "text/plain": 1 * 1024 * 1024, // 1MB para texto
};

// Firmas de archivos maliciosos conocidos (magic bytes)
const MALICIOUS_SIGNATURES = [
  // Ejecutables
  Buffer.from([0x4d, 0x5a]), // PE (Windows executable)
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF (Linux executable)
  Buffer.from([0xfe, 0xed, 0xfa, 0xce]), // Mach-O (macOS executable)
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), // Mach-O 64-bit

  // Scripts
  Buffer.from("<?php"), // PHP script
  Buffer.from("<script"), // JavaScript in HTML
  Buffer.from("#!/bin/"), // Shell script
];

/**
 * Valida el contenido real del archivo
 */
export const validateFileContent = async (buffer, originalFilename) => {
  try {
    // 1. Verificar que el buffer no esté vacío
    if (!buffer || buffer.length === 0) {
      throw new AppError("El archivo está vacío", 400);
    }

    // 2. Detectar el tipo real del archivo por su contenido
    const detectedType = await fileTypeFromBuffer(buffer);

    if (!detectedType) {
      // Para archivos sin firma clara (como algunos documentos de Office antiguos)
      // Verificar al menos que no sea ejecutable
      if (containsMaliciousSignature(buffer)) {
        throw new AppError(
          "Tipo de archivo no permitido por razones de seguridad",
          400
        );
      }

      // Si no podemos detectar el tipo, pero pasa las verificaciones básicas,
      // permitir solo si la extensión es de documento
      const ext = getFileExtension(originalFilename);
      const allowedDocExtensions = [".pdf", ".doc", ".docx", ".txt"];
      if (!allowedDocExtensions.includes(ext)) {
        throw new AppError("No se pudo verificar el tipo de archivo", 400);
      }

      return true;
    }

    // 3. Verificar que el tipo detectado esté en la lista permitida
    if (!ALLOWED_FILE_TYPES[detectedType.mime]) {
      throw new AppError(
        `Tipo de archivo no permitido: ${detectedType.mime}`,
        400
      );
    }

    // 4. Verificar que la extensión coincida con el tipo detectado
    const expectedExtensions = ALLOWED_FILE_TYPES[detectedType.mime];
    const actualExtension = getFileExtension(originalFilename);

    if (!expectedExtensions.includes(actualExtension)) {
      throw new AppError(
        `La extensión del archivo (${actualExtension}) no coincide con su contenido (${detectedType.mime})`,
        400
      );
    }

    // 5. Verificar límites de tamaño
    const sizeLimit = SIZE_LIMITS[detectedType.mime] || 5 * 1024 * 1024; // 5MB por defecto
    if (buffer.length > sizeLimit) {
      throw new AppError(
        `El archivo excede el tamaño permitido (${Math.round(sizeLimit / 1024 / 1024)}MB)`,
        400
      );
    }

    // 6. Verificar firmas maliciosas
    if (containsMaliciousSignature(buffer)) {
      throw new AppError(
        "El archivo contiene contenido potencialmente malicioso",
        400
      );
    }

    // 7. Validaciones específicas por tipo
    await performTypeSpecificValidation(buffer, detectedType.mime);

    return true;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Error al validar el archivo", 400);
  }
};

/**
 * Obtiene la extensión del archivo
 */
const getFileExtension = (filename) => {
  if (!filename) return "";
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? "" : filename.slice(lastDot).toLowerCase();
};

/**
 * Verifica si el buffer contiene firmas maliciosas
 */
const containsMaliciousSignature = (buffer) => {
  return MALICIOUS_SIGNATURES.some((signature) => {
    if (buffer.length < signature.length) return false;
    return buffer.subarray(0, signature.length).equals(signature);
  });
};

/**
 * Validaciones específicas por tipo de archivo
 */
const performTypeSpecificValidation = async (buffer, mimeType) => {
  switch (mimeType) {
    case "application/pdf":
      // Verificar que realmente sea un PDF válido
      if (!buffer.subarray(0, 4).equals(Buffer.from("%PDF"))) {
        throw new AppError("El archivo PDF parece estar corrupto", 400);
      }
      break;

    case "image/jpeg":
      // Verificar firmas JPEG
      if (!(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) {
        throw new AppError("El archivo JPEG parece estar corrupto", 400);
      }
      break;

    case "image/png":
      // Verificar firma PNG
      const pngSignature = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      if (!buffer.subarray(0, 8).equals(pngSignature)) {
        throw new AppError("El archivo PNG parece estar corrupto", 400);
      }
      break;
  }
};

/**
 * Sanitiza el nombre del archivo
 */
export const sanitizeFilename = (originalName) => {
  if (!originalName) {
    return `file_${Date.now()}`;
  }

  // Remover caracteres peligrosos y mantener solo caracteres seguros
  const sanitized = originalName
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Reemplazar caracteres especiales
    .replace(/\.{2,}/g, ".") // Evitar múltiples puntos consecutivos
    .replace(/^\.+/, "") // Evitar que empiece con punto
    .substring(0, 100); // Limitar longitud

  // Si queda vacío después de la sanitización
  if (!sanitized || sanitized === ".") {
    return `file_${Date.now()}`;
  }

  return sanitized;
};
