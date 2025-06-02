import {
  db,
  expedientes,
  approvalFlow,
  users,
  departments,
  documents,
} from "../db/index.js";
import { eq, and, or, desc, asc, like, inArray, sql } from "drizzle-orm";
import { generateId, formatPaginatedResponse } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  EXPEDIENTE_STATUS,
  EXPEDIENTE_LEVELS,
  APPROVAL_ACTIONS,
  ROLES,
} from "../utils/constants.js";
import logger from "../utils/logger.js";
import notificationService from "./notification.service.js";

class ExpedientesService {
  async create(data, userId) {
    const { title, description, departmentId } = data;

    // Generar número de caso único
    const year = new Date().getFullYear();
    const count = await db
      .select({ count: sql`count(*)` })
      .from(expedientes)
      .where(like(expedientes.caseNumber, `${year}-%`));

    const caseNumber = `${year}-${String(count[0].count + 1).padStart(5, "0")}`;

    const expedienteId = generateId("exp");
    const newExpediente = {
      id: expedienteId,
      caseNumber,
      title,
      description,
      status: EXPEDIENTE_STATUS.DRAFT,
      currentLevel: EXPEDIENTE_LEVELS.JUEZ,
      departmentId,
      createdBy: userId,
      assignedTo: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.insert(expedientes).values(newExpediente);

    logger.info("Expediente creado", { expedienteId, caseNumber, userId });

    return this.getById(expedienteId);
  }

  async update(expedienteId, data, userId) {
    // Verificar que existe
    const expediente = await this.getById(expedienteId);

    // Verificar permisos
    if (expediente.createdBy !== userId && expediente.assignedTo !== userId) {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const allowedRoles = [ROLES.ADMIN, ROLES.SECRETARIO_GENERAL];
      if (!allowedRoles.includes(user[0].role)) {
        throw new AppError(
          "No tienes permisos para editar este expediente",
          403
        );
      }
    }

    // Solo permitir edición si está en borrador o devuelto
    if (
      ![EXPEDIENTE_STATUS.DRAFT, EXPEDIENTE_STATUS.REJECTED].includes(
        expediente.status
      )
    ) {
      throw new AppError(
        "No se puede editar un expediente en este estado",
        400
      );
    }

    await db
      .update(expedientes)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(expedientes.id, expedienteId));

    logger.info("Expediente actualizado", { expedienteId, userId });

    return this.getById(expedienteId);
  }

  async delete(expedienteId, userId) {
    const expediente = await this.getById(expedienteId);

    // Solo el creador o admin puede eliminar
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (expediente.createdBy !== userId && user[0].role !== ROLES.ADMIN) {
      throw new AppError(
        "No tienes permisos para eliminar este expediente",
        403
      );
    }

    // Solo se puede eliminar si está en borrador
    if (expediente.status !== EXPEDIENTE_STATUS.DRAFT) {
      throw new AppError(
        "Solo se pueden eliminar expedientes en borrador",
        400
      );
    }

    // Eliminar documentos asociados
    await db.delete(documents).where(eq(documents.expedienteId, expedienteId));

    // Eliminar expediente
    await db.delete(expedientes).where(eq(expedientes.id, expedienteId));

    logger.info("Expediente eliminado", { expedienteId, userId });

    return { success: true };
  }

  async submit(expedienteId, userId, comments) {
    const expediente = await this.getById(expedienteId);

    // Verificar que es el juez asignado
    if (expediente.assignedTo !== userId) {
      throw new AppError(
        "Solo el juez asignado puede enviar este expediente",
        403
      );
    }

    // Verificar estado
    if (
      ![EXPEDIENTE_STATUS.DRAFT, EXPEDIENTE_STATUS.REJECTED].includes(
        expediente.status
      )
    ) {
      throw new AppError(
        "El expediente no está en un estado válido para enviar",
        400
      );
    }

    // Buscar presidente de la audiencia
    const presidente = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.role, ROLES.PRESIDENTE_AUDIENCIA),
          eq(users.departmentId, expediente.departmentId)
        )
      )
      .limit(1);

    if (presidente.length === 0) {
      throw new AppError(
        "No se encontró un presidente de audiencia para este departamento",
        404
      );
    }

    // Actualizar expediente
    await db
      .update(expedientes)
      .set({
        status: EXPEDIENTE_STATUS.PENDING_APPROVAL,
        currentLevel: EXPEDIENTE_LEVELS.PRESIDENTE_AUDIENCIA,
        assignedTo: presidente[0].id,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(expedientes.id, expedienteId));

    // Registrar en flujo de aprobación
    await db.insert(approvalFlow).values({
      id: generateId("apf"),
      expedienteId,
      fromUserId: userId,
      toUserId: presidente[0].id,
      action: APPROVAL_ACTIONS.SUBMIT,
      comments,
      fromLevel: EXPEDIENTE_LEVELS.JUEZ,
      toLevel: EXPEDIENTE_LEVELS.PRESIDENTE_AUDIENCIA,
      createdAt: new Date().toISOString(),
    });

    // Enviar notificación
    await notificationService.createNotification({
      userId: presidente[0].id,
      type: "expediente_assigned",
      title: "Nuevo expediente para revisar",
      message: `El expediente ${expediente.caseNumber} requiere su aprobación`,
      entityType: "expediente",
      entityId: expedienteId,
      metadata: {
        expediente: {
          id: expedienteId,
          caseNumber: expediente.caseNumber,
          title: expediente.title,
          status: EXPEDIENTE_STATUS.PENDING_APPROVAL,
        },
        comments,
      },
    });

    logger.info("Expediente enviado para aprobación", {
      expedienteId,
      fromUserId: userId,
      toUserId: presidente[0].id,
    });

    return this.getById(expedienteId);
  }

  async approve(expedienteId, userId, comments) {
    const expediente = await this.getById(expedienteId);
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      throw new AppError("Usuario no encontrado", 404);
    }

    const userRole = user[0].role;

    // Verificar que es la persona asignada
    if (expediente.assignedTo !== userId) {
      throw new AppError(
        "Solo la persona asignada puede aprobar este expediente",
        403
      );
    }

    let newStatus, newLevel, nextAssignedTo, fromLevel, toLevel;

    // Lógica de aprobación según el nivel actual
    if (
      expediente.currentLevel === EXPEDIENTE_LEVELS.PRESIDENTE_AUDIENCIA &&
      userRole === ROLES.PRESIDENTE_AUDIENCIA
    ) {
      // Buscar secretario general
      const secretario = await db
        .select()
        .from(users)
        .where(eq(users.role, ROLES.SECRETARIO_GENERAL))
        .limit(1);

      if (secretario.length === 0) {
        throw new AppError("No se encontró un secretario general", 404);
      }

      newStatus = EXPEDIENTE_STATUS.PENDING_APPROVAL;
      newLevel = EXPEDIENTE_LEVELS.PRESIDENTE_AUDIENCIA;
      nextAssignedTo = secretario[0].id;
      fromLevel = EXPEDIENTE_LEVELS.PRESIDENTE_AUDIENCIA;
      toLevel = EXPEDIENTE_LEVELS.SECRETARIO_GENERAL;
    } else if (
      expediente.currentLevel === EXPEDIENTE_LEVELS.SECRETARIO_GENERAL &&
      userRole === ROLES.SECRETARIO_GENERAL
    ) {
      // Aprobación final
      newStatus = EXPEDIENTE_STATUS.APPROVED;
      newLevel = EXPEDIENTE_LEVELS.SECRETARIO_GENERAL;
      nextAssignedTo = null;
      fromLevel = EXPEDIENTE_LEVELS.SECRETARIO_GENERAL;
      toLevel = EXPEDIENTE_LEVELS.SECRETARIO_GENERAL;
    } else {
      throw new AppError("No tienes permisos para aprobar en este nivel", 403);
    }

    // Actualizar expediente
    await db
      .update(expedientes)
      .set({
        status: newStatus,
        currentLevel: newLevel,
        assignedTo: nextAssignedTo,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(expedientes.id, expedienteId));

    // Registrar en flujo de aprobación
    await db.insert(approvalFlow).values({
      id: generateId("apf"),
      expedienteId,
      fromUserId: userId,
      toUserId: nextAssignedTo || userId,
      action: APPROVAL_ACTIONS.APPROVE,
      comments,
      fromLevel,
      toLevel,
      createdAt: new Date().toISOString(),
    });

    // Enviar notificación
    if (nextAssignedTo) {
      await notificationService.createNotification({
        userId: nextAssignedTo,
        type: "expediente_assigned",
        title: "Nuevo expediente para revisar",
        message: `El expediente ${expediente.caseNumber} requiere su aprobación`,
        entityType: "expediente",
        entityId: expedienteId,
      });
    } else {
      // Notificar al creador que fue aprobado
      await notificationService.createNotification({
        userId: expediente.createdBy,
        type: "expediente_approved",
        title: "Expediente aprobado",
        message: `El expediente ${expediente.caseNumber} ha sido aprobado`,
        entityType: "expediente",
        entityId: expedienteId,
      });
    }

    logger.info("Expediente aprobado", { expedienteId, userId, newStatus });

    return this.getById(expedienteId);
  }

  async reject(expedienteId, userId, comments) {
    if (!comments) {
      throw new AppError("Los comentarios son obligatorios al rechazar", 400);
    }

    const expediente = await this.getById(expedienteId);

    // Verificar que es la persona asignada
    if (expediente.assignedTo !== userId) {
      throw new AppError(
        "Solo la persona asignada puede rechazar este expediente",
        403
      );
    }

    // Actualizar expediente
    await db
      .update(expedientes)
      .set({
        status: EXPEDIENTE_STATUS.REJECTED,
        assignedTo: expediente.createdBy,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(expedientes.id, expedienteId));

    // Registrar en flujo de aprobación
    await db.insert(approvalFlow).values({
      id: generateId("apf"),
      expedienteId,
      fromUserId: userId,
      toUserId: expediente.createdBy,
      action: APPROVAL_ACTIONS.REJECT,
      comments,
      fromLevel: expediente.currentLevel,
      toLevel: EXPEDIENTE_LEVELS.JUEZ,
      createdAt: new Date().toISOString(),
    });

    // Notificar al creador
    await notificationService.createNotification({
      userId: expediente.createdBy,
      type: "expediente_rejected",
      title: "Expediente rechazado",
      message: `El expediente ${expediente.caseNumber} ha sido rechazado. Revise los comentarios.`,
      entityType: "expediente",
      entityId: expedienteId,
    });

    logger.info("Expediente rechazado", { expedienteId, userId });

    return this.getById(expedienteId);
  }

  async returnForRevision(expedienteId, userId, comments) {
    if (!comments) {
      throw new AppError(
        "Los comentarios son obligatorios al devolver para revisión",
        400
      );
    }

    const expediente = await this.getById(expedienteId);

    // Verificar que es la persona asignada
    if (expediente.assignedTo !== userId) {
      throw new AppError(
        "Solo la persona asignada puede devolver este expediente",
        403
      );
    }

    let returnToUserId, returnToLevel;

    // Determinar a quién devolver según el nivel actual
    if (expediente.currentLevel === EXPEDIENTE_LEVELS.SECRETARIO_GENERAL) {
      // Devolver al presidente de audiencia
      const flowHistory = await db
        .select()
        .from(approvalFlow)
        .where(
          and(
            eq(approvalFlow.expedienteId, expedienteId),
            eq(approvalFlow.toLevel, EXPEDIENTE_LEVELS.SECRETARIO_GENERAL)
          )
        )
        .orderBy(desc(approvalFlow.createdAt))
        .limit(1);

      returnToUserId = flowHistory[0].fromUserId;
      returnToLevel = EXPEDIENTE_LEVELS.PRESIDENTE_AUDIENCIA;
    } else {
      // Devolver al juez creador
      returnToUserId = expediente.createdBy;
      returnToLevel = EXPEDIENTE_LEVELS.JUEZ;
    }

    // Actualizar expediente
    await db
      .update(expedientes)
      .set({
        status: EXPEDIENTE_STATUS.DRAFT,
        currentLevel: returnToLevel,
        assignedTo: returnToUserId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(expedientes.id, expedienteId));

    // Registrar en flujo de aprobación
    await db.insert(approvalFlow).values({
      id: generateId("apf"),
      expedienteId,
      fromUserId: userId,
      toUserId: returnToUserId,
      action: APPROVAL_ACTIONS.RETURN,
      comments,
      fromLevel: expediente.currentLevel,
      toLevel: returnToLevel,
      createdAt: new Date().toISOString(),
    });

    // Notificar
    await notificationService.createNotification({
      userId: returnToUserId,
      type: "expediente_returned",
      title: "Expediente devuelto para revisión",
      message: `El expediente ${expediente.caseNumber} ha sido devuelto. Revise los comentarios.`,
      entityType: "expediente",
      entityId: expedienteId,
    });

    logger.info("Expediente devuelto para revisión", {
      expedienteId,
      userId,
      returnToUserId,
    });

    return this.getById(expedienteId);
  }

  async getById(expedienteId) {
    const result = await db
      .select({
        expediente: expedientes,
        creator: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
        department: {
          id: departments.id,
          name: departments.name,
        },
      })
      .from(expedientes)
      .leftJoin(users, eq(expedientes.createdBy, users.id))
      .leftJoin(departments, eq(expedientes.departmentId, departments.id))
      .where(eq(expedientes.id, expedienteId))
      .limit(1);

    if (result.length === 0) {
      throw new AppError("Expediente no encontrado", 404);
    }

    // Obtener documentos asociados
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.expedienteId, expedienteId));

    return {
      ...result[0].expediente,
      creator: result[0].creator,
      department: result[0].department,
      documents: docs,
    };
  }

  async getList(filters, pagination, userId, userRole) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    // Construir condiciones
    const conditions = [];

    // Filtros de búsqueda
    if (filters.search) {
      conditions.push(
        or(
          like(expedientes.caseNumber, `%${filters.search}%`),
          like(expedientes.title, `%${filters.search}%`)
        )
      );
    }

    if (filters.status) {
      conditions.push(eq(expedientes.status, filters.status));
    }

    if (filters.departmentId) {
      conditions.push(eq(expedientes.departmentId, filters.departmentId));
    }

    // Filtros según rol
    const viewAllRoles = [
      ROLES.ADMIN,
      ROLES.SECRETARIO_GENERAL,
      ROLES.PRESIDENTE_CSPJ,
    ];

    if (!viewAllRoles.includes(userRole)) {
      if (userRole === ROLES.PRESIDENTE_AUDIENCIA) {
        // Ver expedientes de su departamento
        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        conditions.push(eq(expedientes.departmentId, user[0].departmentId));
      } else if (userRole === ROLES.JUEZ) {
        // Ver solo sus expedientes o los que le fueron asignados
        conditions.push(
          or(
            eq(expedientes.createdBy, userId),
            eq(expedientes.assignedTo, userId)
          )
        );
      }
    }

    // Consulta principal
    const query = db
      .select({
        expediente: expedientes,
        creator: {
          id: users.id,
          fullName: users.fullName,
        },
        department: {
          id: departments.id,
          name: departments.name,
        },
      })
      .from(expedientes)
      .leftJoin(users, eq(expedientes.createdBy, users.id))
      .leftJoin(departments, eq(expedientes.departmentId, departments.id))
      .orderBy(desc(expedientes.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    const result = await query;

    // Contar total
    const countQuery = db.select({ count: sql`count(*)` }).from(expedientes);

    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }

    const [{ count }] = await countQuery;

    return formatPaginatedResponse(
      result.map((r) => ({
        ...r.expediente,
        creator: r.creator,
        department: r.department,
      })),
      page,
      limit,
      Number(count)
    );
  }

  async getApprovalHistory(expedienteId) {
    const history = await db
      .select({
        flow: approvalFlow,
        fromUser: {
          id: users.id,
          fullName: users.fullName,
          role: users.role,
        },
        toUser: {
          id: sql`tu.id`,
          fullName: sql`tu.full_name`,
          role: sql`tu.role`,
        },
      })
      .from(approvalFlow)
      .leftJoin(users, eq(approvalFlow.fromUserId, users.id))
      .leftJoin(sql`users as tu`, eq(approvalFlow.toUserId, sql`tu.id`))
      .where(eq(approvalFlow.expedienteId, expedienteId))
      .orderBy(desc(approvalFlow.createdAt));

    return history.map((h) => ({
      ...h.flow,
      fromUser: h.fromUser,
      toUser: h.toUser,
    }));
  }

  async getStatistics(userId, userRole, departmentId) {
    const conditions = [];

    // Aplicar filtros según rol
    if (userRole === ROLES.JUEZ) {
      conditions.push(
        or(
          eq(expedientes.createdBy, userId),
          eq(expedientes.assignedTo, userId)
        )
      );
    } else if (userRole === ROLES.PRESIDENTE_AUDIENCIA && departmentId) {
      conditions.push(eq(expedientes.departmentId, departmentId));
    }

    const baseQuery = conditions.length > 0 ? and(...conditions) : undefined;

    // Estadísticas por estado
    const byStatus = await db
      .select({
        status: expedientes.status,
        count: sql`count(*)`,
      })
      .from(expedientes)
      .where(baseQuery)
      .groupBy(expedientes.status);

    // Total de expedientes
    const [{ total }] = await db
      .select({ total: sql`count(*)` })
      .from(expedientes)
      .where(baseQuery);

    // Expedientes pendientes de mi acción
    const [{ pending }] = await db
      .select({ pending: sql`count(*)` })
      .from(expedientes)
      .where(
        and(
          eq(expedientes.assignedTo, userId),
          eq(expedientes.status, EXPEDIENTE_STATUS.PENDING_APPROVAL)
        )
      );

    return {
      total: Number(total),
      pending: Number(pending),
      byStatus: byStatus.reduce((acc, curr) => {
        acc[curr.status] = Number(curr.count);
        return acc;
      }, {}),
    };
  }
}

export default new ExpedientesService();
