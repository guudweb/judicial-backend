import { db, auditLogs, users } from "../db/index.js";
import { formatPaginatedResponse } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import { eq, and, gte, lte, like, desc, sql } from "drizzle-orm";

class AuditService {
  async getLogs(filters, pagination) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    // Construir condiciones
    const conditions = [];

    if (filters.userId) {
      conditions.push(eq(auditLogs.userId, filters.userId));
    }

    if (filters.action) {
      conditions.push(like(auditLogs.action, `%${filters.action}%`));
    }

    if (filters.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType));
    }

    if (filters.entityId) {
      conditions.push(eq(auditLogs.entityId, filters.entityId));
    }

    if (filters.startDate) {
      conditions.push(gte(auditLogs.createdAt, filters.startDate));
    }

    if (filters.endDate) {
      conditions.push(lte(auditLogs.createdAt, filters.endDate));
    }

    // Obtener logs con información del usuario
    const logsQuery = db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        userEmail: users.email,
        userFullName: users.fullName,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      logsQuery.where(and(...conditions));
    }

    const logs = await logsQuery;

    // Contar total
    const countQuery = db.select({ count: sql`count(*)` }).from(auditLogs);

    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }

    const [{ count }] = await countQuery;

    // Parsear JSON en los valores
    const parsedLogs = logs.map((log) => ({
      ...log,
      oldValues: log.oldValues ? JSON.parse(log.oldValues) : null,
      newValues: log.newValues ? JSON.parse(log.newValues) : null,
    }));

    return formatPaginatedResponse(parsedLogs, page, limit, Number(count));
  }

  async getUserActivity(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await db
      .select({
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.userId, userId),
          gte(auditLogs.createdAt, startDate.toISOString())
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);

    return logs;
  }

  async getEntityHistory(entityType, entityId) {
    const logs = await db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        userEmail: users.email,
        userFullName: users.fullName,
        action: auditLogs.action,
        oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(
        and(
          eq(auditLogs.entityType, entityType),
          eq(auditLogs.entityId, entityId)
        )
      )
      .orderBy(desc(auditLogs.createdAt));

    // Parsear JSON en los valores
    return logs.map((log) => ({
      ...log,
      oldValues: log.oldValues ? JSON.parse(log.oldValues) : null,
      newValues: log.newValues ? JSON.parse(log.newValues) : null,
    }));
  }

  async getStatistics(startDate, endDate) {
    // Estadísticas por acción
    const actionStats = await db
      .select({
        action: auditLogs.action,
        count: sql`count(*)`,
      })
      .from(auditLogs)
      .where(
        and(
          gte(auditLogs.createdAt, startDate),
          lte(auditLogs.createdAt, endDate)
        )
      )
      .groupBy(auditLogs.action);

    // Estadísticas por usuario
    const userStats = await db
      .select({
        userId: auditLogs.userId,
        userEmail: users.email,
        userFullName: users.fullName,
        count: sql`count(*)`,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(
        and(
          gte(auditLogs.createdAt, startDate),
          lte(auditLogs.createdAt, endDate)
        )
      )
      .groupBy(auditLogs.userId, users.email, users.fullName)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    // Estadísticas por tipo de entidad
    const entityStats = await db
      .select({
        entityType: auditLogs.entityType,
        count: sql`count(*)`,
      })
      .from(auditLogs)
      .where(
        and(
          gte(auditLogs.createdAt, startDate),
          lte(auditLogs.createdAt, endDate)
        )
      )
      .groupBy(auditLogs.entityType);

    return {
      byAction: actionStats,
      byUser: userStats,
      byEntity: entityStats,
      period: { startDate, endDate },
    };
  }
}

export default new AuditService();
