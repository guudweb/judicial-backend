import { db, notifications } from "../db/index.js";
import { generateId } from "../utils/helpers.js";
import logger from "../utils/logger.js";
import emailService from "./email.service.js";

class NotificationService {
  async createNotification(data) {
    try {
      const notification = {
        id: generateId("not"),
        ...data,
        status: "pending",
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
}

export default new NotificationService();
