// Lista de campos sensibles que no deben loggearse
const SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "token",
  "refreshToken",
  "authToken",
  "email",
  "dni",
  "phone",
  "fullName",
  "ipAddress",
  "userAgent",
];

// Función para sanitizar objetos
const sanitizeLogData = (data) => {
  if (!data || typeof data !== "object") return data;

  const sanitized = { ...data };

  SENSITIVE_FIELDS.forEach((field) => {
    if (sanitized[field]) {
      if (field === "email") {
        // Para emails, mostrar solo dominio
        sanitized[field] = sanitized[field].replace(/^[^@]+/, "***");
      } else if (field === "dni") {
        // Para DNI, mostrar solo últimos 2 dígitos
        sanitized[field] = "***" + sanitized[field].slice(-2);
      } else {
        // Para otros campos sensibles, reemplazar completamente
        sanitized[field] = "[REDACTED]";
      }
    }
  });

  return sanitized;
};

const logger = {
  info: (message, meta = {}) => {
    console.log(
      JSON.stringify({
        level: "info",
        message,
        timestamp: new Date().toISOString(),
        ...sanitizeLogData(meta),
      })
    );
  },

  error: (message, error = null, meta = {}) => {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        error: error?.stack || error?.message || error,
        timestamp: new Date().toISOString(),
        ...sanitizeLogData(meta),
      })
    );
  },

  warn: (message, meta = {}) => {
    console.warn(
      JSON.stringify({
        level: "warn",
        message,
        timestamp: new Date().toISOString(),
        ...sanitizeLogData(meta),
      })
    );
  },

  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === "development") {
      console.debug(
        JSON.stringify({
          level: "debug",
          message,
          timestamp: new Date().toISOString(),
          ...sanitizeLogData(meta),
        })
      );
    }
  },
};

export default logger;
