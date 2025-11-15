import { db, notifications, users } from "../db/index.js";
import {
  eq,
  and,
  or,
  desc,
  asc,
  like,
  sql,
  gte,
  lte,
  ne,
  inArray,
} from "drizzle-orm";
import { generateId, formatPaginatedResponse } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import logger from "../utils/logger.js";
import emailService from "./email.service.js";

class NotificationService {
  // MÉTODO EXISTENTE - Crear notificación y enviar email
  async createNotification(data) {
    try {
      const notification = {
        id: generateId("not"),
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        status: "unread",
        entityType: data.entityType || null,
        entityId: data.entityId || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        createdAt: new Date().toISOString(),
      };

      await db.insert(notifications).values(notification);

      // Enviar email según el tipo de notificación
      await this.sendEmailNotification(data);

      logger.info("Notificación creada y enviada", {
        notificationId: notification.id,
        userId: data.userId,
        type: data.type,
      });

      return notification;
    } catch (error) {
      logger.error("Error al crear notificación", error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  // MÉTODO EXISTENTE - Enviar email
  async sendEmailNotification(data) {
    const { type, userId, entityType, entityId, metadata } = data;

    try {
      switch (type) {
        case "expediente_assigned":
        case "expediente_approved":
        case "expediente_rejected":
        case "expediente_returned":
          await emailService.sendExpedienteNotification({
            userId,
            expediente: metadata?.expediente || { id: entityId },
            action: type.replace("expediente_", ""),
            comments: metadata?.comments,
          });
          break;

        case "news_pending_approval":
        case "news_published":
        case "news_rejected":
        case "court_submission":
          await emailService.sendNewsNotification({
            userId,
            news: metadata?.news || { id: entityId },
            action: type,
          });
          break;

        case "citizen_contact":
          await emailService.sendNewContactNotification({
            userId,
            contact: metadata?.contact || { id: entityId },
          });
          break;

        case "contact_assigned":
          // Por ahora solo notificación interna
          break;

        default:
          logger.warn("Tipo de notificación no manejado para email", { type });
      }
    } catch (error) {
      logger.error("Error al enviar email de notificación", error, {
        type,
        userId,
      });
    }
  }

  // MÉTODOS NUEVOS - Gestión de notificaciones

  async getById(notificationId, userId) {
    const result = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new AppError("Notificación no encontrada", 404);
    }

    const notification = result[0];

    // Parsear metadata
    if (notification.metadata) {
      try {
        notification.metadata = JSON.parse(notification.metadata);
      } catch (e) {
        // Mantener como string si no es JSON válido
      }
    }

    return notification;
  }

  async getList(userId, filters, pagination) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const conditions = [eq(notifications.userId, userId)];

    // Excluir notificaciones eliminadas por defecto
    if (filters.status !== "all") {
      conditions.push(ne(notifications.status, "deleted"));
    }

    // Filtros
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(notifications.status, filters.status));
    }

    if (filters.type) {
      conditions.push(eq(notifications.type, filters.type));
    }

    if (filters.startDate) {
      conditions.push(gte(notifications.createdAt, filters.startDate));
    }

    if (filters.endDate) {
      conditions.push(lte(notifications.createdAt, filters.endDate));
    }

    const query = db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const result = await query;

    // Contar total
    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(notifications)
      .where(and(...conditions));

    // Parsear metadata en cada notificación
    const notificationsWithParsedMetadata = result.map((notif) => {
      if (notif.metadata) {
        try {
          notif.metadata = JSON.parse(notif.metadata);
        } catch (e) {
          // Mantener como string si no es JSON válido
        }
      }
      return notif;
    });

    return formatPaginatedResponse(
      notificationsWithParsedMetadata,
      page,
      limit,
      Number(count)
    );
  }

  async markAsRead(notificationId, userId) {
    const notification = await this.getById(notificationId, userId);

    if (notification.status === "read") {
      return notification;
    }

    await db
      .update(notifications)
      .set({
        status: "read",
        readAt: new Date().toISOString(),
      })
      .where(eq(notifications.id, notificationId));

    return {
      ...notification,
      status: "read",
      readAt: new Date().toISOString(),
    };
  }

  async markMultipleAsRead(notificationIds, userId) {
    if (!notificationIds || notificationIds.length === 0) {
      throw new AppError("No se proporcionaron IDs de notificaciones", 400);
    }

    // Verificar que todas las notificaciones pertenecen al usuario
    const userNotifications = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          inArray(notifications.id, notificationIds),
          eq(notifications.userId, userId)
        )
      );

    const validIds = userNotifications.map((n) => n.id);

    if (validIds.length === 0) {
      throw new AppError("No se encontraron notificaciones válidas", 404);
    }

    await db
      .update(notifications)
      .set({
        status: "read",
        readAt: new Date().toISOString(),
      })
      .where(
        and(
          inArray(notifications.id, validIds),
          eq(notifications.status, "unread")
        )
      );

    return {
      updated: validIds.length,
      ids: validIds,
    };
  }

  async deleteNotification(notificationId, userId) {
    const notification = await this.getById(notificationId, userId);

    // Soft delete - marcar como eliminada
    await db
      .update(notifications)
      .set({
        status: "deleted",
        deletedAt: new Date().toISOString(),
      })
      .where(eq(notifications.id, notificationId));

    logger.info("Notificación eliminada", { notificationId, userId });

    return { success: true };
  }

  async getUnreadCount(userId) {
    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.status, "unread")
        )
      );

    return Number(count);
  }

  async updatePreferences(userId, preferences) {
    // Por ahora, las preferencias se podrían guardar en la tabla users
    // o en una tabla separada user_preferences
    // Para este ejemplo, retornamos las preferencias sin persistirlas

    logger.info("Preferencias de notificación actualizadas", {
      userId,
      preferences,
    });

    return preferences;
  }

  // Método auxiliar para obtener notificaciones por tipo de entidad
  async getByEntity(entityType, entityId, userId) {
    const result = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.entityType, entityType),
          eq(notifications.entityId, entityId),
          ne(notifications.status, "deleted")
        )
      )
      .orderBy(desc(notifications.createdAt));

    return result.map((notif) => {
      if (notif.metadata) {
        try {
          notif.metadata = JSON.parse(notif.metadata);
        } catch (e) {
          // Mantener como string
        }
      }
      return notif;
    });
  }
}

export default new NotificationService();
