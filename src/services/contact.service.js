import { db, citizenContacts, users, documents } from "../db/index.js";
import { eq, and, or, desc, asc, like, sql, ne } from "drizzle-orm";
import { generateId, formatPaginatedResponse } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import { CONTACT_STATUS, ROLES } from "../utils/constants.js";
import logger from "../utils/logger.js";
import notificationService from "./notification.service.js";
import cloudinary from "../config/cloudinary.js";

class ContactService {
  async create(data, attachmentFile = null) {
    const { fullName, dni, phone, email, subject, message } = data;

    let attachmentUrl = null;

    // Subir archivo adjunto si se proporciona
    if (attachmentFile) {
      try {
        const result = await this.uploadAttachment(attachmentFile, dni);
        attachmentUrl = result.secure_url;
      } catch (error) {
        logger.error("Error al subir archivo adjunto", error);
        // No lanzar error, continuar sin adjunto
      }
    }

    const contactId = generateId("con");
    const newContact = {
      id: contactId,
      fullName,
      dni,
      phone,
      email,
      subject,
      message,
      attachmentUrl,
      status: CONTACT_STATUS.PENDING,
      createdAt: new Date().toISOString(),
    };

    await db.insert(citizenContacts).values(newContact);

    // Notificar al secretario adjunto
    const secretarioAdjunto = await db
      .select()
      .from(users)
      .where(eq(users.role, ROLES.SECRETARIO_ADJUNTO))
      .limit(1);

    if (secretarioAdjunto.length > 0) {
      await notificationService.createNotification({
        userId: secretarioAdjunto[0].id,
        type: "citizen_contact",
        title: "Nuevo mensaje ciudadano",
        message: `${fullName} ha enviado un mensaje: ${subject}`,
        entityType: "contact",
        entityId: contactId,
      });
    }

    logger.info("Mensaje ciudadano creado", { contactId, dni, subject });

    return {
      id: contactId,
      message:
        "Su mensaje ha sido enviado exitosamente. Recibirá una respuesta en su correo electrónico.",
    };
  }

  async uploadAttachment(file, dni) {
    const timestamp = Date.now();
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const publicId = `judicial/citizen_contacts/${dni}_${timestamp}_${safeFileName}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          public_id: publicId,
          folder: "judicial/citizen_contacts",
          tags: ["contacto_ciudadano"],
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      uploadStream.end(file.buffer);
    });
  }

  async getById(contactId, userId) {
    // Verificar permisos
    await this.checkPermissions(userId, "view");

    const result = await db
      .select({
        contact: citizenContacts,
        assignedUser: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(citizenContacts)
      .leftJoin(users, eq(citizenContacts.assignedTo, users.id))
      .where(eq(citizenContacts.id, contactId))
      .limit(1);

    if (result.length === 0) {
      throw new AppError("Mensaje no encontrado", 404);
    }

    return {
      ...result[0].contact,
      assignedUser: result[0].assignedUser,
    };
  }

  async getList(filters, pagination, userId) {
    // Verificar permisos
    await this.checkPermissions(userId, "view");

    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const conditions = [];

    // Filtros
    if (filters.search) {
      conditions.push(
        or(
          like(citizenContacts.fullName, `%${filters.search}%`),
          like(citizenContacts.dni, `%${filters.search}%`),
          like(citizenContacts.email, `%${filters.search}%`),
          like(citizenContacts.subject, `%${filters.search}%`)
        )
      );
    }

    if (filters.status) {
      conditions.push(eq(citizenContacts.status, filters.status));
    }

    if (filters.assignedTo) {
      conditions.push(eq(citizenContacts.assignedTo, filters.assignedTo));
    }

    const query = db
      .select({
        contact: citizenContacts,
        assignedUser: {
          id: users.id,
          fullName: users.fullName,
        },
      })
      .from(citizenContacts)
      .leftJoin(users, eq(citizenContacts.assignedTo, users.id))
      .orderBy(desc(citizenContacts.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    const result = await query;

    // Contar total
    const countQuery = db
      .select({ count: sql`count(*)` })
      .from(citizenContacts);

    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }

    const [{ count }] = await countQuery;

    return formatPaginatedResponse(
      result.map((r) => ({
        ...r.contact,
        assignedUser: r.assignedUser,
      })),
      page,
      limit,
      Number(count)
    );
  }

  async updateStatus(contactId, status, userId) {
    // Verificar permisos
    await this.checkPermissions(userId, "update");

    const contact = await this.getById(contactId, userId);

    if (!Object.values(CONTACT_STATUS).includes(status)) {
      throw new AppError("Estado inválido", 400);
    }

    await db
      .update(citizenContacts)
      .set({
        status,
        assignedTo:
          status === CONTACT_STATUS.IN_PROGRESS ? userId : contact.assignedTo,
      })
      .where(eq(citizenContacts.id, contactId));

    logger.info("Estado de contacto actualizado", {
      contactId,
      status,
      userId,
    });

    return this.getById(contactId, userId);
  }

  async assign(contactId, assignToUserId, userId) {
    // Verificar permisos
    await this.checkPermissions(userId, "assign");

    // Verificar que el usuario asignado existe y tiene permisos
    const assignedUser = await db
      .select()
      .from(users)
      .where(eq(users.id, assignToUserId))
      .limit(1);

    if (assignedUser.length === 0) {
      throw new AppError("Usuario no encontrado", 404);
    }

    const allowedRoles = [
      ROLES.SECRETARIO_ADJUNTO,
      ROLES.SECRETARIO_GENERAL,
      ROLES.PRESIDENTE_CSPJ,
      ROLES.VICEPRESIDENTE_CSPJ,
    ];

    if (!allowedRoles.includes(assignedUser[0].role)) {
      throw new AppError(
        "El usuario no tiene permisos para gestionar mensajes",
        400
      );
    }

    await db
      .update(citizenContacts)
      .set({
        assignedTo: assignToUserId,
        status: CONTACT_STATUS.IN_PROGRESS,
      })
      .where(eq(citizenContacts.id, contactId));

    // Notificar al usuario asignado
    await notificationService.createNotification({
      userId: assignToUserId,
      type: "contact_assigned",
      title: "Mensaje ciudadano asignado",
      message: "Se te ha asignado un nuevo mensaje ciudadano para gestionar",
      entityType: "contact",
      entityId: contactId,
    });

    logger.info("Contacto asignado", {
      contactId,
      assignToUserId,
      assignedBy: userId,
    });

    return this.getById(contactId, userId);
  }

  async addResponse(contactId, response, userId) {
    // Verificar permisos
    await this.checkPermissions(userId, "update");

    const contact = await this.getById(contactId, userId);

    // Verificar que el usuario es quien tiene asignado el mensaje
    if (contact.assignedTo !== userId) {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // Permitir a roles superiores responder
      const superiorRoles = [ROLES.SECRETARIO_GENERAL, ROLES.PRESIDENTE_CSPJ];
      if (!superiorRoles.includes(user[0].role)) {
        throw new AppError(
          "Solo el usuario asignado puede responder este mensaje",
          403
        );
      }
    }

    // Enviar email al ciudadano
    await emailService.sendCitizenResponse({
      citizenEmail: contact.email,
      citizenName: contact.fullName,
      subject: contact.subject,
      response,
    });

    // Actualizar estado
    await db
      .update(citizenContacts)
      .set({
        status: CONTACT_STATUS.RESOLVED,
      })
      .where(eq(citizenContacts.id, contactId));

    logger.info("Respuesta enviada a ciudadano", {
      contactId,
      userId,
      citizenEmail: contact.email,
    });

    // Por ahora, solo actualizamos el estado
    await db
      .update(citizenContacts)
      .set({
        status: CONTACT_STATUS.RESOLVED,
      })
      .where(eq(citizenContacts.id, contactId));

    logger.info("Respuesta enviada a ciudadano", {
      contactId,
      userId,
      citizenEmail: contact.email,
    });

    return {
      success: true,
      message: "Respuesta enviada exitosamente",
    };
  }

  async getStatistics(userId) {
    // Verificar permisos
    await this.checkPermissions(userId, "view");

    // Total por estado
    const byStatus = await db
      .select({
        status: citizenContacts.status,
        count: sql`count(*)`,
      })
      .from(citizenContacts)
      .groupBy(citizenContacts.status);

    // Mensajes de hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [{ todayCount }] = await db
      .select({ todayCount: sql`count(*)` })
      .from(citizenContacts)
      .where(sql`${citizenContacts.createdAt} >= ${today.toISOString()}`);

    // Mensajes de esta semana
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [{ weekCount }] = await db
      .select({ weekCount: sql`count(*)` })
      .from(citizenContacts)
      .where(sql`${citizenContacts.createdAt} >= ${weekAgo.toISOString()}`);

    // Tiempo promedio de respuesta (para mensajes resueltos)
    const resolvedMessages = await db
      .select({
        createdAt: citizenContacts.createdAt,
        // Aquí podrías tener un campo resolvedAt si lo añades al esquema
      })
      .from(citizenContacts)
      .where(eq(citizenContacts.status, CONTACT_STATUS.RESOLVED));

    return {
      byStatus: byStatus.reduce((acc, curr) => {
        acc[curr.status] = Number(curr.count);
        return acc;
      }, {}),
      today: Number(todayCount),
      thisWeek: Number(weekCount),
      totalResolved: resolvedMessages.length,
    };
  }

  async checkPermissions(userId, action) {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      throw new AppError("Usuario no encontrado", 404);
    }

    const permissions = {
      view: [
        ROLES.SECRETARIO_ADJUNTO,
        ROLES.SECRETARIO_GENERAL,
        ROLES.PRESIDENTE_CSPJ,
        ROLES.VICEPRESIDENTE_CSPJ,
        ROLES.ADMIN,
      ],
      update: [
        ROLES.SECRETARIO_ADJUNTO,
        ROLES.SECRETARIO_GENERAL,
        ROLES.PRESIDENTE_CSPJ,
        ROLES.VICEPRESIDENTE_CSPJ,
        ROLES.ADMIN,
      ],
      assign: [ROLES.SECRETARIO_ADJUNTO, ROLES.ADMIN],
    };

    if (!permissions[action]?.includes(user[0].role)) {
      throw new AppError("No tienes permisos para realizar esta acción", 403);
    }

    return true;
  }
}

export default new ContactService();
