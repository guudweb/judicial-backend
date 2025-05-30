import csrf from "csurf";
import { AppError } from "./errorHandler.js";

// Configuración del middleware CSRF
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600000, // 1 hora
  },
  ignoreMethods: ["GET", "HEAD", "OPTIONS"],
  value: (req) => {
    // Buscar el token CSRF en varios lugares
    return (
      req.body._csrf ||
      req.query._csrf ||
      req.headers["csrf-token"] ||
      req.headers["xsrf-token"] ||
      req.headers["x-csrf-token"] ||
      req.headers["x-xsrf-token"]
    );
  },
});

// Middleware para manejar errores CSRF
export const handleCSRFError = (err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return next(new AppError("Token CSRF inválido o faltante", 403));
  }
  next(err);
};

// Middleware para generar y enviar token CSRF
export const generateCSRFToken = (req, res, next) => {
  // Solo generar token si el middleware CSRF fue aplicado
  if (typeof req.csrfToken === "function") {
    try {
      const token = req.csrfToken();

      // Agregar el token a la respuesta
      res.locals.csrfToken = token;

      // Si es una petición AJAX, enviar el token en headers
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        res.set("X-CSRF-Token", token);
      }
    } catch (error) {
      console.error("Error generando token CSRF:", error);
      // Si hay error, continuar sin token (para rutas que no necesitan CSRF)
    }
  }

  next();
};

// Rutas que NO necesitan protección CSRF (solo lectura)
const CSRF_EXEMPT_PATHS = [
  // Health check
  "/health",

  // Rutas públicas de solo lectura
  "/api/news/public",
  "/api/books/public",
  "/api/departments/public",

  // Autenticación (ya tienen su propia protección)
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",

  // Endpoints de solo lectura que no modifican estado
  "/api/dashboard",
  "/api/notifications",
  "/api/audit",
  "/api/expedientes", // GET
  "/api/documents", // GET
  "/api/contact", // GET (solo para admins)
  "/api/users", // GET
  "/api/books", // GET
  "/api/departments", // GET
];

// Middleware condicional para CSRF
export const conditionalCSRFProtection = (req, res, next) => {
  // Verificar si la ruta está exenta
  const isExempt = CSRF_EXEMPT_PATHS.some((path) => req.path.startsWith(path));

  // Verificar si es una operación de solo lectura
  const isReadOnly = ["GET", "HEAD", "OPTIONS"].includes(req.method);

  if (isExempt || isReadOnly) {
    // Para rutas exentas, solo aplicar el middleware base para tener req.csrfToken disponible
    // pero sin validar el token
    return csrfProtection(req, res, (err) => {
      if (err && err.code === "EBADCSRFTOKEN") {
        // Ignorar errores de token para rutas exentas
        return next();
      } else if (err) {
        return next(err);
      }
      next();
    });
  }

  // Aplicar protección CSRF completa para operaciones de escritura
  csrfProtection(req, res, next);
};

// Middleware específico para operaciones críticas
export const strictCSRFProtection = csrfProtection;

export default csrfProtection;
