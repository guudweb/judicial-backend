import { db, auditLogs } from "../db/index.js";
import { generateId } from "../utils/helpers.js";
import logger from "../utils/logger.js";

// Acciones que se deben auditar
const AUDITABLE_ACTIONS = {
  // Auth
  "auth.login": "Inicio de sesión",
  "auth.logout": "Cierre de sesión",
  "auth.register": "Registro de usuario",
  "auth.password_change": "Cambio de contraseña",

  // Expedientes
  "expediente.create": "Creación de expediente",
  "expediente.update": "Actualización de expediente",
  "expediente.delete": "Eliminación de expediente",
  "expediente.submit": "Envío de expediente",
  "expediente.approve": "Aprobación de expediente",
  "expediente.reject": "Rechazo de expediente",
  "expediente.return": "Devolución de expediente",

  // Documentos
  "document.upload": "Carga de documento",
  "document.delete": "Eliminación de documento",

  // Noticias
  "news.create": "Creación de noticia",
  "news.update": "Actualización de noticia",
  "news.delete": "Eliminación de noticia",
  "news.publish": "Publicación de noticia",
  "news.submit": "Envío de noticia para aprobación",
  "news.approve": "Aprobación de noticia",
  "news.reject": "Rechazo de noticia",

  // Usuarios
  "user.create": "Creación de usuario",
  "user.update": "Actualización de usuario",
  "user.deactivate": "Desactivación de usuario",
  "user.activate": "Activación de usuario",

  // Contacto
  "contact.assign": "Asignación de mensaje",
  "contact.resolve": "Resolución de mensaje",

  // Departamentos
  "department.create": "Creación de departamento",
  "department.update": "Actualización de departamento",
  "department.toggle_status": "Cambio de estado de departamento",
  "department.reorder": "Reordenamiento de departamentos",
};

// Middleware para auditar acciones
export const audit = (action, getEntityData) => {
  return async (req, res, next) => {
    // Guardar la función send original
    const originalSend = res.send;
    const originalJson = res.json;

    // Función para registrar la auditoría
    const logAudit = async (body) => {
      try {
        // Solo auditar si la respuesta fue exitosa
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const entityData = getEntityData
            ? await getEntityData(req, res, body)
            : {};

          const auditEntry = {
            id: generateId("aud"),
            userId: req.user?.id || "system",
            action: AUDITABLE_ACTIONS[action] || action,
            entityType: entityData.type || action.split(".")[0],
            entityId: entityData.id || "N/A",
            oldValues: entityData.oldValues
              ? JSON.stringify(entityData.oldValues)
              : null,
            newValues: entityData.newValues
              ? JSON.stringify(entityData.newValues)
              : null,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("user-agent"),
            createdAt: new Date().toISOString(),
          };

          await db.insert(auditLogs).values(auditEntry);

          logger.info("Acción auditada", {
            action,
            userId: auditEntry.userId,
            entityType: auditEntry.entityType,
            entityId: auditEntry.entityId,
          });
        }
      } catch (error) {
        logger.error("Error al registrar auditoría", error);
        // No interrumpir el flujo si falla la auditoría
      }
    };

    // Interceptar res.send
    res.send = function (body) {
      res.send = originalSend;
      logAudit(body).then(() => {
        res.send(body);
      });
    };

    // Interceptar res.json
    res.json = function (body) {
      res.json = originalJson;
      logAudit(body).then(() => {
        res.json(body);
      });
    };

    next();
  };
};

// Helpers para obtener datos de entidad
export const auditHelpers = {
  // Para expedientes
  expediente: (req, res, body) => ({
    type: "expediente",
    id: req.params.id || body?.data?.id,
    newValues: body?.data,
  }),

  // Para usuarios
  user: (req, res, body) => ({
    type: "user",
    id: req.params.id || body?.data?.id,
    newValues: body?.data,
  }),

  // Para noticias
  news: (req, res, body) => ({
    type: "news",
    id: req.params.id || body?.data?.id,
    newValues: body?.data,
  }),

  // Para documentos
  document: (req, res, body) => ({
    type: "document",
    id: body?.data?.id,
    newValues: {
      filename: body?.data?.filename,
      expedienteId: req.params.expedienteId,
    },
  }),
};
