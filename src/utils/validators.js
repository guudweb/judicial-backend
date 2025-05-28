import { z } from "zod";
import {
  ROLES,
  EXPEDIENTE_STATUS,
  NEWS_STATUS,
  NEWS_TYPES,
} from "./constants.js";

// Validadores de Usuario
export const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  fullName: z
    .string()
    .min(3, "El nombre completo debe tener al menos 3 caracteres"),
  dni: z.string().min(5, "DNI inválido"),
  phone: z.string().optional(),
  role: z.enum(Object.values(ROLES)),
  departmentId: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

// Validadores de Expediente
export const createExpedienteSchema = z.object({
  title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
  description: z.string().optional(),
  departmentId: z.string().min(1, "El departamento es requerido"),
});

export const updateExpedienteSchema = z.object({
  title: z.string().min(5).optional(),
  description: z.string().optional(),
  status: z.enum(Object.values(EXPEDIENTE_STATUS)).optional(),
});

// Validadores de Noticias
export const createNewsSchema = z.object({
  title: z.string().min(5, "El título debe tener al menos 5 caracteres"),
  content: z.string().min(10, "El contenido debe tener al menos 10 caracteres"),
  type: z.enum(Object.values(NEWS_TYPES)),
});

// Validadores de Contacto
export const createContactSchema = z.object({
  fullName: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  dni: z.string().min(5, "DNI inválido"),
  phone: z.string().min(8, "Teléfono inválido"),
  email: z.string().email("Email inválido"),
  subject: z.string().min(5, "El asunto debe tener al menos 5 caracteres"),
  message: z.string().min(10, "El mensaje debe tener al menos 10 caracteres"),
});

// Validador de paginación
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

// Middleware de validación para body
export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware de validación para query - Actualizado para Express 5
export const validateQuery = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse(req.query);
    // En Express 5, no podemos reasignar req.query
    // En su lugar, adjuntamos los valores validados a req
    req.validatedQuery = validated;
    next();
  } catch (error) {
    next(error);
  }
};

// Re-exportar z para uso en otros archivos
export { z };
