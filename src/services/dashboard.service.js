import {
  db,
  expedientes,
  news,
  citizenContacts,
  notifications,
  users,
  approvalFlow,
  newsApprovalFlow,
} from "../db/index.js";
import { eq, and, or, desc, sql, gte, ne } from "drizzle-orm";
import {
  ROLES,
  EXPEDIENTE_STATUS,
  NEWS_STATUS,
  CONTACT_STATUS,
} from "../utils/constants.js";
import logger from "../utils/logger.js";

class DashboardService {
  async getPendingTasks(userId, userRole, departmentId) {
    const tasks = {
      expedientes: [],
      news: [],
      contacts: [],
      total: 0,
    };

    try {
      // EXPEDIENTES PENDIENTES
      if (
        [
          ROLES.JUEZ,
          ROLES.PRESIDENTE_AUDIENCIA,
          ROLES.SECRETARIO_GENERAL,
        ].includes(userRole)
      ) {
        const pendingExpedientes = await db
          .select({
            id: expedientes.id,
            caseNumber: expedientes.caseNumber,
            title: expedientes.title,
            status: expedientes.status,
            currentLevel: expedientes.currentLevel,
            createdAt: expedientes.createdAt,
            createdBy: expedientes.createdBy,
            creatorName: users.fullName,
          })
          .from(expedientes)
          .leftJoin(users, eq(expedientes.createdBy, users.id))
          .where(
            and(
              eq(expedientes.assignedTo, userId),
              eq(expedientes.status, EXPEDIENTE_STATUS.PENDING_APPROVAL)
            )
          )
          .orderBy(desc(expedientes.createdAt))
          .limit(10);

        tasks.expedientes = pendingExpedientes.map((exp) => ({
          ...exp,
          type: "expediente",
          action: "aprobar",
          priority: this.calculatePriority(exp.createdAt),
        }));
      }

      // NOTICIAS PENDIENTES
      if (userRole === ROLES.DIRECTOR_PRENSA) {
        const pendingNews = await db
          .select({
            id: news.id,
            title: news.title,
            type: news.type,
            status: news.status,
            authorId: news.authorId,
            authorName: users.fullName,
            createdAt: news.createdAt,
          })
          .from(news)
          .leftJoin(users, eq(news.authorId, users.id))
          .where(eq(news.status, NEWS_STATUS.PENDING_DIRECTOR))
          .orderBy(desc(news.createdAt))
          .limit(10);

        tasks.news = pendingNews.map((n) => ({
          ...n,
          type: "news",
          action: "revisar",
          priority: this.calculatePriority(n.createdAt),
        }));
      } else if (userRole === ROLES.PRESIDENTE_CSPJ) {
        const pendingNews = await db
          .select({
            id: news.id,
            title: news.title,
            type: news.type,
            status: news.status,
            authorId: news.authorId,
            authorName: users.fullName,
            createdAt: news.createdAt,
          })
          .from(news)
          .leftJoin(users, eq(news.authorId, users.id))
          .where(eq(news.status, NEWS_STATUS.PENDING_PRESIDENT))
          .orderBy(desc(news.createdAt))
          .limit(10);

        tasks.news = pendingNews.map((n) => ({
          ...n,
          type: "news",
          action: "aprobar",
          priority: this.calculatePriority(n.createdAt),
        }));
      }

      // MENSAJES CIUDADANOS PENDIENTES
      if (
        [
          ROLES.SECRETARIO_ADJUNTO,
          ROLES.SECRETARIO_GENERAL,
          ROLES.PRESIDENTE_CSPJ,
          ROLES.VICEPRESIDENTE_CSPJ,
        ].includes(userRole)
      ) {
        const pendingContacts = await db
          .select({
            id: citizenContacts.id,
            fullName: citizenContacts.fullName,
            subject: citizenContacts.subject,
            status: citizenContacts.status,
            createdAt: citizenContacts.createdAt,
          })
          .from(citizenContacts)
          .where(
            or(
              eq(citizenContacts.status, CONTACT_STATUS.PENDING),
              and(
                eq(citizenContacts.status, CONTACT_STATUS.IN_PROGRESS),
                eq(citizenContacts.assignedTo, userId)
              )
            )
          )
          .orderBy(desc(citizenContacts.createdAt))
          .limit(10);

        tasks.contacts = pendingContacts.map((c) => ({
          ...c,
          type: "contact",
          action: c.status === CONTACT_STATUS.PENDING ? "asignar" : "responder",
          priority: this.calculatePriority(c.createdAt),
        }));
      }

      // Calcular total
      tasks.total =
        tasks.expedientes.length + tasks.news.length + tasks.contacts.length;

      return tasks;
    } catch (error) {
      logger.error("Error al obtener tareas pendientes", error);
      return tasks;
    }
  }

  async getSummary(userId, userRole, departmentId, period = "week") {
    const summary = {
      notifications: { unread: 0, total: 0 },
      expedientes: { pending: 0, processed: 0 },
      news: { pending: 0, processed: 0 },
      contacts: { pending: 0, processed: 0 },
      recentActions: [],
    };

    try {
      // Fecha de inicio según el período
      const startDate = this.getStartDate(period);

      // NOTIFICACIONES
      const [{ unread }] = await db
        .select({ unread: sql`count(*)` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.status, "unread")
          )
        );

      const [{ total }] = await db
        .select({ total: sql`count(*)` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            ne(notifications.status, "deleted")
          )
        );

      summary.notifications = {
        unread: Number(unread),
        total: Number(total),
      };

      // EXPEDIENTES (según rol)
      if (
        [
          ROLES.JUEZ,
          ROLES.PRESIDENTE_AUDIENCIA,
          ROLES.SECRETARIO_GENERAL,
        ].includes(userRole)
      ) {
        const [{ pending }] = await db
          .select({ pending: sql`count(*)` })
          .from(expedientes)
          .where(
            and(
              eq(expedientes.assignedTo, userId),
              eq(expedientes.status, EXPEDIENTE_STATUS.PENDING_APPROVAL)
            )
          );

        // Procesados en el período
        const processedQuery = await db
          .select({ count: sql`count(*)` })
          .from(approvalFlow)
          .where(
            and(
              eq(approvalFlow.fromUserId, userId),
              gte(approvalFlow.createdAt, startDate)
            )
          );

        summary.expedientes = {
          pending: Number(pending),
          processed: Number(processedQuery[0].count),
        };
      }

      // NOTICIAS (según rol)
      if (
        [
          ROLES.TECNICO_PRENSA,
          ROLES.DIRECTOR_PRENSA,
          ROLES.PRESIDENTE_CSPJ,
        ].includes(userRole)
      ) {
        let pendingStatus = null;

        if (userRole === ROLES.DIRECTOR_PRENSA) {
          pendingStatus = NEWS_STATUS.PENDING_DIRECTOR;
        } else if (userRole === ROLES.PRESIDENTE_CSPJ) {
          pendingStatus = NEWS_STATUS.PENDING_PRESIDENT;
        }

        if (pendingStatus) {
          const [{ pending }] = await db
            .select({ pending: sql`count(*)` })
            .from(news)
            .where(eq(news.status, pendingStatus));

          summary.news.pending = Number(pending);
        }

        // Procesadas en el período
        const processedNews = await db
          .select({ count: sql`count(*)` })
          .from(newsApprovalFlow)
          .where(
            and(
              eq(newsApprovalFlow.fromUserId, userId),
              gte(newsApprovalFlow.createdAt, startDate)
            )
          );

        summary.news.processed = Number(processedNews[0].count);
      }

      // CONTACTOS (según rol)
      if (
        [
          ROLES.SECRETARIO_ADJUNTO,
          ROLES.SECRETARIO_GENERAL,
          ROLES.PRESIDENTE_CSPJ,
          ROLES.VICEPRESIDENTE_CSPJ,
        ].includes(userRole)
      ) {
        const [{ pending }] = await db
          .select({ pending: sql`count(*)` })
          .from(citizenContacts)
          .where(
            or(
              eq(citizenContacts.status, CONTACT_STATUS.PENDING),
              and(
                eq(citizenContacts.status, CONTACT_STATUS.IN_PROGRESS),
                eq(citizenContacts.assignedTo, userId)
              )
            )
          );

        const [{ processed }] = await db
          .select({ processed: sql`count(*)` })
          .from(citizenContacts)
          .where(
            and(
              eq(citizenContacts.status, CONTACT_STATUS.RESOLVED),
              eq(citizenContacts.assignedTo, userId),
              gte(citizenContacts.createdAt, startDate)
            )
          );

        summary.contacts = {
          pending: Number(pending),
          processed: Number(processed),
        };
      }

      return summary;
    } catch (error) {
      logger.error("Error al obtener resumen del dashboard", error);
      return summary;
    }
  }

  async getRecentActivity(userId, userRole, departmentId, limit = 10) {
    const activities = [];

    try {
      // Actividad reciente de expedientes
      if (
        [
          ROLES.JUEZ,
          ROLES.PRESIDENTE_AUDIENCIA,
          ROLES.SECRETARIO_GENERAL,
        ].includes(userRole)
      ) {
        const recentExpedientes = await db
          .select({
            id: approvalFlow.id,
            type: sql`'expediente'`,
            action: approvalFlow.action,
            entityId: approvalFlow.expedienteId,
            title: expedientes.title,
            caseNumber: expedientes.caseNumber,
            createdAt: approvalFlow.createdAt,
          })
          .from(approvalFlow)
          .innerJoin(expedientes, eq(approvalFlow.expedienteId, expedientes.id))
          .where(
            or(
              eq(approvalFlow.fromUserId, userId),
              eq(approvalFlow.toUserId, userId)
            )
          )
          .orderBy(desc(approvalFlow.createdAt))
          .limit(limit);

        activities.push(...recentExpedientes);
      }

      // Actividad reciente de noticias
      if (
        [
          ROLES.TECNICO_PRENSA,
          ROLES.DIRECTOR_PRENSA,
          ROLES.PRESIDENTE_CSPJ,
        ].includes(userRole)
      ) {
        const recentNews = await db
          .select({
            id: newsApprovalFlow.id,
            type: sql`'news'`,
            action: newsApprovalFlow.action,
            entityId: newsApprovalFlow.newsId,
            title: news.title,
            createdAt: newsApprovalFlow.createdAt,
          })
          .from(newsApprovalFlow)
          .innerJoin(news, eq(newsApprovalFlow.newsId, news.id))
          .where(
            or(
              eq(newsApprovalFlow.fromUserId, userId),
              eq(newsApprovalFlow.toUserId, userId)
            )
          )
          .orderBy(desc(newsApprovalFlow.createdAt))
          .limit(limit);

        activities.push(...recentNews);
      }

      // Ordenar por fecha y limitar
      activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return activities.slice(0, limit);
    } catch (error) {
      logger.error("Error al obtener actividad reciente", error);
      return [];
    }
  }

  async getStatsByRole(userId, userRole, departmentId) {
    const stats = {};

    try {
      switch (userRole) {
        case ROLES.JUEZ:
          stats.expedientes = await this.getJuezStats(userId);
          break;

        case ROLES.PRESIDENTE_AUDIENCIA:
          stats.expedientes = await this.getPresidenteAudienciaStats(
            userId,
            departmentId
          );
          break;

        case ROLES.SECRETARIO_GENERAL:
          stats.expedientes = await this.getSecretarioGeneralStats();
          stats.overview = await this.getSystemOverview();
          break;

        case ROLES.DIRECTOR_PRENSA:
          stats.news = await this.getDirectorPrensaStats();
          break;

        case ROLES.PRESIDENTE_CSPJ:
          stats.news = await this.getPresidenteCspjNewsStats();
          stats.overview = await this.getSystemOverview();
          break;

        case ROLES.TECNICO_PRENSA:
          stats.news = await this.getTecnicoPrensaStats(userId);
          break;

        case ROLES.SECRETARIO_ADJUNTO:
          stats.contacts = await this.getSecretarioAdjuntoStats();
          break;

        default:
          stats.message = "No hay estadísticas disponibles para este rol";
      }

      return stats;
    } catch (error) {
      logger.error("Error al obtener estadísticas por rol", error);
      return { error: "Error al cargar estadísticas" };
    }
  }

  // Métodos auxiliares

  calculatePriority(createdAt) {
    const now = new Date();
    const created = new Date(createdAt);
    const hoursDiff = (now - created) / (1000 * 60 * 60);

    if (hoursDiff < 24) return "alta";
    if (hoursDiff < 72) return "media";
    return "baja";
  }

  getStartDate(period) {
    const now = new Date();
    switch (period) {
      case "day":
        return new Date(now.setDate(now.getDate() - 1)).toISOString();
      case "week":
        return new Date(now.setDate(now.getDate() - 7)).toISOString();
      case "month":
        return new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      default:
        return new Date(now.setDate(now.getDate() - 7)).toISOString();
    }
  }

  async getJuezStats(userId) {
    const [stats] = await db
      .select({
        total: sql`count(*)`,
        draft: sql`sum(case when status = 'draft' then 1 else 0 end)`,
        pending: sql`sum(case when status = 'pending_approval' then 1 else 0 end)`,
        approved: sql`sum(case when status = 'approved' then 1 else 0 end)`,
        rejected: sql`sum(case when status = 'rejected' then 1 else 0 end)`,
      })
      .from(expedientes)
      .where(eq(expedientes.createdBy, userId));

    return {
      total: Number(stats.total),
      draft: Number(stats.draft || 0),
      pending: Number(stats.pending || 0),
      approved: Number(stats.approved || 0),
      rejected: Number(stats.rejected || 0),
    };
  }

  async getPresidenteAudienciaStats(userId, departmentId) {
    const [pending] = await db
      .select({ count: sql`count(*)` })
      .from(expedientes)
      .where(
        and(
          eq(expedientes.assignedTo, userId),
          eq(expedientes.status, EXPEDIENTE_STATUS.PENDING_APPROVAL)
        )
      );

    const [departmentTotal] = await db
      .select({ count: sql`count(*)` })
      .from(expedientes)
      .where(eq(expedientes.departmentId, departmentId));

    return {
      pendingApproval: Number(pending.count),
      departmentTotal: Number(departmentTotal.count),
    };
  }

  async getSecretarioGeneralStats() {
    const [pending] = await db
      .select({ count: sql`count(*)` })
      .from(expedientes)
      .where(
        and(
          eq(expedientes.currentLevel, "secretario_general"),
          eq(expedientes.status, EXPEDIENTE_STATUS.PENDING_APPROVAL)
        )
      );

    const [total] = await db.select({ count: sql`count(*)` }).from(expedientes);

    return {
      pendingFinalApproval: Number(pending.count),
      totalSystem: Number(total.count),
    };
  }

  async getDirectorPrensaStats() {
    const [pending] = await db
      .select({ count: sql`count(*)` })
      .from(news)
      .where(eq(news.status, NEWS_STATUS.PENDING_DIRECTOR));

    const [published] = await db
      .select({ count: sql`count(*)` })
      .from(news)
      .where(eq(news.status, NEWS_STATUS.PUBLISHED));

    return {
      pendingReview: Number(pending.count),
      totalPublished: Number(published.count),
    };
  }

  async getPresidenteCspjNewsStats() {
    const [pending] = await db
      .select({ count: sql`count(*)` })
      .from(news)
      .where(eq(news.status, NEWS_STATUS.PENDING_PRESIDENT));

    return {
      pendingPresidentialApproval: Number(pending.count),
    };
  }

  async getTecnicoPrensaStats(userId) {
    const [stats] = await db
      .select({
        total: sql`count(*)`,
        draft: sql`sum(case when status = 'draft' then 1 else 0 end)`,
        pending: sql`sum(case when status in ('pending_director_approval', 'pending_president_approval') then 1 else 0 end)`,
        published: sql`sum(case when status = 'published' then 1 else 0 end)`,
      })
      .from(news)
      .where(eq(news.authorId, userId));

    return {
      total: Number(stats.total),
      draft: Number(stats.draft || 0),
      pending: Number(stats.pending || 0),
      published: Number(stats.published || 0),
    };
  }

  async getSecretarioAdjuntoStats() {
    const [stats] = await db
      .select({
        pending: sql`sum(case when status = 'pending' then 1 else 0 end)`,
        inProgress: sql`sum(case when status = 'in_progress' then 1 else 0 end)`,
        resolved: sql`sum(case when status = 'resolved' then 1 else 0 end)`,
      })
      .from(citizenContacts);

    return {
      pending: Number(stats.pending || 0),
      inProgress: Number(stats.inProgress || 0),
      resolved: Number(stats.resolved || 0),
    };
  }

  async getSystemOverview() {
    const [expedientesCount] = await db
      .select({ count: sql`count(*)` })
      .from(expedientes);

    const [newsCount] = await db
      .select({ count: sql`count(*)` })
      .from(news)
      .where(eq(news.status, NEWS_STATUS.PUBLISHED));

    const [usersCount] = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(eq(users.isActive, true));

    return {
      totalExpedientes: Number(expedientesCount.count),
      publishedNews: Number(newsCount.count),
      activeUsers: Number(usersCount.count),
    };
  }
}

export default new DashboardService();
