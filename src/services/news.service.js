import { db, news, users, departments } from "../db/index.js";
import cloudinary from "../config/cloudinary.js";
import { eq, and, or, desc, asc, like, inArray, sql, ne } from "drizzle-orm";
import {
  generateId,
  formatPaginatedResponse,
  generateSlug,
  generateUniqueSlug,
} from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import { NEWS_STATUS, NEWS_TYPES, ROLES } from "../utils/constants.js";
import logger from "../utils/logger.js";
import notificationService from "./notification.service.js";

class NewsService {
  async create(data, userId, imageFile = null) {
    const { title, subtitle, content, type } = data;

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      throw new AppError("Usuario no encontrado", 404);
    }

    // Validar permisos según rol
    const allowedRoles = [ROLES.TECNICO_PRENSA, ROLES.DIRECTOR_PRENSA];
    if (!allowedRoles.includes(user[0].role)) {
      throw new AppError("No tienes permisos para crear noticias", 403);
    }

    // Generar slug único
    const baseSlug = generateSlug(title);
    const slug = await generateUniqueSlug(baseSlug, async (s) => {
      const existing = await db
        .select()
        .from(news)
        .where(eq(news.slug, s))
        .limit(1);
      return existing.length > 0;
    });

    let imageUrl = null;
    let imagePublicId = null;

    // Subir imagen si se proporciona
    if (imageFile) {
      try {
        const result = await this.uploadNewsImage(imageFile, slug);
        imageUrl = result.secure_url;
        imagePublicId = result.public_id;
      } catch (error) {
        logger.error("Error al subir imagen de noticia", error);
        // No lanzar error, continuar sin imagen
      }
    }

    const newsId = generateId("news");
    const newNews = {
      id: newsId,
      title,
      subtitle,
      slug,
      content,
      type,
      status: NEWS_STATUS.DRAFT,
      authorId: userId,
      imageUrl,
      imagePublicId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.insert(news).values(newNews);

    logger.info("Noticia creada", { newsId, type, userId, slug });

    return this.getById(newsId);
  }

  async update(newsId, data, userId, imageFile = null) {
    const newsItem = await this.getById(newsId);

    // Verificar permisos
    if (newsItem.authorId !== userId) {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // El director puede editar cualquier noticia
      if (
        user[0].role !== ROLES.DIRECTOR_PRENSA &&
        user[0].role !== ROLES.ADMIN
      ) {
        throw new AppError("No tienes permisos para editar esta noticia", 403);
      }
    }

    // Solo se puede editar si está en borrador o fue devuelta
    const editableStatuses = [NEWS_STATUS.DRAFT];
    if (!editableStatuses.includes(newsItem.status)) {
      throw new AppError("No se puede editar una noticia en este estado", 400);
    }

    const { title, subtitle, content } = data;
    let updateData = {
      subtitle,
      content,
      updatedAt: new Date().toISOString(),
    };

    // Si cambia el título, regenerar slug
    if (title && title !== newsItem.title) {
      updateData.title = title;
      const baseSlug = generateSlug(title);
      updateData.slug = await generateUniqueSlug(baseSlug, async (s) => {
        const existing = await db
          .select()
          .from(news)
          .where(and(eq(news.slug, s), ne(news.id, newsId)))
          .limit(1);
        return existing.length > 0;
      });
    }

    // Manejar actualización de imagen
    if (imageFile) {
      // Eliminar imagen anterior si existe
      if (newsItem.imagePublicId) {
        try {
          await cloudinary.uploader.destroy(newsItem.imagePublicId);
        } catch (error) {
          logger.error("Error al eliminar imagen anterior", error);
        }
      }

      // Subir nueva imagen
      try {
        const result = await this.uploadNewsImage(imageFile, newsItem.slug);
        updateData.imageUrl = result.secure_url;
        updateData.imagePublicId = result.public_id;
      } catch (error) {
        logger.error("Error al subir nueva imagen", error);
      }
    } else if (data.removeImage && newsItem.imagePublicId) {
      // Opción para remover imagen sin subir una nueva
      try {
        await cloudinary.uploader.destroy(newsItem.imagePublicId);
        updateData.imageUrl = null;
        updateData.imagePublicId = null;
      } catch (error) {
        logger.error("Error al eliminar imagen", error);
      }
    }

    await db.update(news).set(updateData).where(eq(news.id, newsId));

    logger.info("Noticia actualizada", { newsId, userId });

    return this.getById(newsId);
  }

  async uploadNewsImage(imageFile, slug) {
    const timestamp = Date.now();
    const publicId = `judicial/news/${slug}_${timestamp}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          public_id: publicId,
          folder: "judicial/news",
          transformation: [
            { width: 1200, height: 630, crop: "fill", gravity: "center" },
            { quality: "auto:good" },
            { fetch_format: "auto" },
          ],
          tags: ["noticia_judicial"],
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      uploadStream.end(imageFile.buffer);
    });
  }

  async delete(newsId, userId) {
    const newsItem = await this.getById(newsId);

    // Verificar permisos
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const canDelete =
      newsItem.authorId === userId ||
      user[0].role === ROLES.DIRECTOR_PRENSA ||
      user[0].role === ROLES.ADMIN;

    if (!canDelete) {
      throw new AppError("No tienes permisos para eliminar esta noticia", 403);
    }

    // Solo se puede eliminar si está en borrador
    if (newsItem.status !== NEWS_STATUS.DRAFT) {
      throw new AppError("Solo se pueden eliminar noticias en borrador", 400);
    }

    // Eliminar imagen si existe
    if (newsItem.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(newsItem.imagePublicId);
      } catch (error) {
        logger.error("Error al eliminar imagen de noticia", error);
      }
    }

    await db.delete(news).where(eq(news.id, newsId));

    logger.info("Noticia eliminada", { newsId, userId });

    return { success: true };
  }

  // Método para obtener noticia por slug (útil para URLs amigables)
  async getBySlug(slug) {
    const result = await db
      .select({
        news: news,
        author: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(news)
      .leftJoin(users, eq(news.authorId, users.id))
      .where(eq(news.slug, slug))
      .limit(1);

    if (result.length === 0) {
      throw new AppError("Noticia no encontrada", 404);
    }

    // Solo mostrar noticias publicadas al buscar por slug
    if (result[0].news.status !== NEWS_STATUS.PUBLISHED) {
      throw new AppError("Noticia no disponible", 404);
    }

    return {
      ...result[0].news,
      author: result[0].author,
    };
  }

  async submitToDirector(newsId, userId) {
    const newsItem = await this.getById(newsId);

    // Solo el autor puede enviar su noticia
    if (newsItem.authorId !== userId) {
      throw new AppError("Solo el autor puede enviar esta noticia", 403);
    }

    // Verificar estado
    if (newsItem.status !== NEWS_STATUS.DRAFT) {
      throw new AppError("La noticia no está en estado borrador", 400);
    }

    // Si el autor es el director, enviar directamente al presidente
    const author = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    let newStatus;
    let notifyUserId;
    let notifyMessage;

    if (author[0].role === ROLES.DIRECTOR_PRENSA) {
      // Enviar al presidente
      newStatus = NEWS_STATUS.PENDING_PRESIDENT;

      const presidente = await db
        .select()
        .from(users)
        .where(eq(users.role, ROLES.PRESIDENTE_CSPJ))
        .limit(1);

      if (presidente.length === 0) {
        throw new AppError("No se encontró el presidente del CSPJ", 404);
      }

      notifyUserId = presidente[0].id;
      notifyMessage = "Nueva noticia pendiente de aprobación presidencial";
    } else {
      // Enviar al director
      newStatus = NEWS_STATUS.PENDING_DIRECTOR;

      const director = await db
        .select()
        .from(users)
        .where(eq(users.role, ROLES.DIRECTOR_PRENSA))
        .limit(1);

      if (director.length === 0) {
        throw new AppError("No se encontró el director de prensa", 404);
      }

      notifyUserId = director[0].id;
      notifyMessage = "Nueva noticia pendiente de revisión";
    }

    await db
      .update(news)
      .set({
        status: newStatus,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(news.id, newsId));

    // Notificar
    await notificationService.createNotification({
      userId: notifyUserId,
      type: "news_pending_approval",
      title: "Nueva noticia para revisar",
      message: notifyMessage,
      entityType: "news",
      entityId: newsId,
    });

    logger.info("Noticia enviada para aprobación", { newsId, newStatus });

    return this.getById(newsId);
  }

  async approveByDirector(newsId, userId, comments) {
    const newsItem = await this.getById(newsId);

    // Verificar que es el director
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user[0].role !== ROLES.DIRECTOR_PRENSA) {
      throw new AppError(
        "Solo el director de prensa puede aprobar en este nivel",
        403
      );
    }

    // Verificar estado
    if (newsItem.status !== NEWS_STATUS.PENDING_DIRECTOR) {
      throw new AppError(
        "La noticia no está pendiente de aprobación del director",
        400
      );
    }

    // Si es aviso o comunicado, publicar directamente
    if (
      newsItem.type === NEWS_TYPES.AVISO ||
      newsItem.type === NEWS_TYPES.COMUNICADO
    ) {
      await db
        .update(news)
        .set({
          status: NEWS_STATUS.PUBLISHED,
          approvedByDirector: userId,
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(news.id, newsId));

      logger.info("Aviso/Comunicado publicado por director", { newsId });

      // Notificar al autor
      await notificationService.createNotification({
        userId: newsItem.authorId,
        type: "news_published",
        title: "Tu contenido ha sido publicado",
        message: `Tu ${newsItem.type} "${newsItem.title}" ha sido publicado`,
        entityType: "news",
        entityId: newsId,
      });

      return this.getById(newsId);
    }

    // Si es noticia, enviar al presidente
    const presidente = await db
      .select()
      .from(users)
      .where(eq(users.role, ROLES.PRESIDENTE_CSPJ))
      .limit(1);

    if (presidente.length === 0) {
      throw new AppError("No se encontró el presidente del CSPJ", 404);
    }

    await db
      .update(news)
      .set({
        status: NEWS_STATUS.PENDING_PRESIDENT,
        approvedByDirector: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(news.id, newsId));

    // Notificar al presidente
    await notificationService.createNotification({
      userId: presidente[0].id,
      type: "news_pending_approval",
      title: "Noticia pendiente de aprobación",
      message: `La noticia "${newsItem.title}" requiere su aprobación`,
      entityType: "news",
      entityId: newsId,
    });

    logger.info("Noticia aprobada por director y enviada al presidente", {
      newsId,
    });

    return this.getById(newsId);
  }

  async approveByPresident(newsId, userId, comments) {
    const newsItem = await this.getById(newsId);

    // Verificar que es el presidente
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user[0].role !== ROLES.PRESIDENTE_CSPJ) {
      throw new AppError(
        "Solo el presidente del CSPJ puede aprobar en este nivel",
        403
      );
    }

    // Verificar estado
    if (newsItem.status !== NEWS_STATUS.PENDING_PRESIDENT) {
      throw new AppError(
        "La noticia no está pendiente de aprobación presidencial",
        400
      );
    }

    // Verificar que es una noticia (no aviso/comunicado)
    if (newsItem.type !== NEWS_TYPES.NOTICIA) {
      throw new AppError(
        "Solo las noticias requieren aprobación presidencial",
        400
      );
    }

    await db
      .update(news)
      .set({
        status: NEWS_STATUS.PUBLISHED,
        approvedByPresident: userId,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(news.id, newsId));

    // Notificar al autor y al director
    await notificationService.createNotification({
      userId: newsItem.authorId,
      type: "news_published",
      title: "Noticia publicada",
      message: `Tu noticia "${newsItem.title}" ha sido aprobada y publicada`,
      entityType: "news",
      entityId: newsId,
    });

    if (newsItem.approvedByDirector) {
      await notificationService.createNotification({
        userId: newsItem.approvedByDirector,
        type: "news_published",
        title: "Noticia aprobada por presidencia",
        message: `La noticia "${newsItem.title}" ha sido aprobada y publicada`,
        entityType: "news",
        entityId: newsId,
      });
    }

    logger.info("Noticia aprobada por presidente y publicada", { newsId });

    return this.getById(newsId);
  }

  async reject(newsId, userId, comments) {
    if (!comments) {
      throw new AppError("Los comentarios son obligatorios al rechazar", 400);
    }

    const newsItem = await this.getById(newsId);
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Verificar permisos según estado
    let canReject = false;
    if (
      newsItem.status === NEWS_STATUS.PENDING_DIRECTOR &&
      user[0].role === ROLES.DIRECTOR_PRENSA
    ) {
      canReject = true;
    } else if (
      newsItem.status === NEWS_STATUS.PENDING_PRESIDENT &&
      user[0].role === ROLES.PRESIDENTE_CSPJ
    ) {
      canReject = true;
    }

    if (!canReject) {
      throw new AppError("No tienes permisos para rechazar esta noticia", 403);
    }

    // Devolver a borrador
    await db
      .update(news)
      .set({
        status: NEWS_STATUS.DRAFT,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(news.id, newsId));

    // Notificar al autor
    await notificationService.createNotification({
      userId: newsItem.authorId,
      type: "news_rejected",
      title: "Noticia rechazada",
      message: `Tu noticia "${newsItem.title}" ha sido rechazada. Motivo: ${comments}`,
      entityType: "news",
      entityId: newsId,
    });

    logger.info("Noticia rechazada", { newsId, userId });

    return { success: true, comments };
  }

  async getById(newsId) {
    const result = await db
      .select({
        news: news,
        author: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
        directorApprover: {
          id: sql`d.id`,
          fullName: sql`d.full_name`,
        },
        presidentApprover: {
          id: sql`p.id`,
          fullName: sql`p.full_name`,
        },
      })
      .from(news)
      .leftJoin(users, eq(news.authorId, users.id))
      .leftJoin(sql`users as d`, eq(news.approvedByDirector, sql`d.id`))
      .leftJoin(sql`users as p`, eq(news.approvedByPresident, sql`p.id`))
      .where(eq(news.id, newsId))
      .limit(1);

    if (result.length === 0) {
      throw new AppError("Noticia no encontrada", 404);
    }

    return {
      ...result[0].news,
      author: result[0].author,
      directorApprover: result[0].directorApprover.id
        ? result[0].directorApprover
        : null,
      presidentApprover: result[0].presidentApprover.id
        ? result[0].presidentApprover
        : null,
    };
  }

  async getList(filters, pagination, isPublic = false) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const conditions = [];

    // Si es consulta pública, solo mostrar publicadas
    if (isPublic) {
      conditions.push(eq(news.status, NEWS_STATUS.PUBLISHED));
    }

    // Filtros
    if (filters.search) {
      conditions.push(
        or(
          like(news.title, `%${filters.search}%`),
          like(news.content, `%${filters.search}%`)
        )
      );
    }

    if (filters.type) {
      conditions.push(eq(news.type, filters.type));
    }

    if (filters.status && !isPublic) {
      conditions.push(eq(news.status, filters.status));
    }

    if (filters.authorId && !isPublic) {
      conditions.push(eq(news.authorId, filters.authorId));
    }

    const query = db
      .select({
        news: news,
        author: {
          id: users.id,
          fullName: users.fullName,
        },
      })
      .from(news)
      .leftJoin(users, eq(news.authorId, users.id))
      .orderBy(desc(news.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    const result = await query;

    // Contar total
    const countQuery = db.select({ count: sql`count(*)` }).from(news);

    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }

    const [{ count }] = await countQuery;

    return formatPaginatedResponse(
      result.map((r) => ({
        ...r.news,
        author: r.author,
        // En consultas públicas, limitar información sensible
        ...(isPublic && {
          approvedByDirector: undefined,
          approvedByPresident: undefined,
        }),
      })),
      page,
      limit,
      Number(count)
    );
  }

  async getStatistics(userId, userRole) {
    const conditions = [];

    // Filtrar según rol
    if (userRole === ROLES.TECNICO_PRENSA) {
      conditions.push(eq(news.authorId, userId));
    }

    const baseQuery = conditions.length > 0 ? and(...conditions) : undefined;

    // Total por estado
    const byStatus = await db
      .select({
        status: news.status,
        count: sql`count(*)`,
      })
      .from(news)
      .where(baseQuery)
      .groupBy(news.status);

    // Total por tipo
    const byType = await db
      .select({
        type: news.type,
        count: sql`count(*)`,
      })
      .from(news)
      .where(baseQuery)
      .groupBy(news.type);

    // Publicadas este mes
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [{ publishedThisMonth }] = await db
      .select({ publishedThisMonth: sql`count(*)` })
      .from(news)
      .where(
        and(
          baseQuery,
          eq(news.status, NEWS_STATUS.PUBLISHED),
          sql`${news.publishedAt} >= ${startOfMonth.toISOString()}`
        )
      );

    return {
      byStatus: byStatus.reduce((acc, curr) => {
        acc[curr.status] = Number(curr.count);
        return acc;
      }, {}),
      byType: byType.reduce((acc, curr) => {
        acc[curr.type] = Number(curr.count);
        return acc;
      }, {}),
      publishedThisMonth: Number(publishedThisMonth),
    };
  }

  // Método especial para que los juzgados envíen avisos/comunicados
  async submitFromCourt(data, userId, imageFile = null) {
    const { title, subtitle, content, type, attachmentUrl } = data;

    // Verificar que es un juzgado (juez o presidente de audiencia)
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const courtRoles = [ROLES.JUEZ, ROLES.PRESIDENTE_AUDIENCIA];
    if (!courtRoles.includes(user[0].role)) {
      throw new AppError(
        "Solo los juzgados pueden enviar avisos y comunicados",
        403
      );
    }

    // Solo pueden enviar avisos o comunicados
    if (![NEWS_TYPES.AVISO, NEWS_TYPES.COMUNICADO].includes(type)) {
      throw new AppError(
        "Los juzgados solo pueden enviar avisos o comunicados",
        400
      );
    }

    // Generar slug
    const baseSlug = generateSlug(title);
    const slug = await generateUniqueSlug(baseSlug, async (s) => {
      const existing = await db
        .select()
        .from(news)
        .where(eq(news.slug, s))
        .limit(1);
      return existing.length > 0;
    });

    let imageUrl = null;
    let imagePublicId = null;

    // Subir imagen si se proporciona
    if (imageFile) {
      try {
        const result = await this.uploadNewsImage(imageFile, slug);
        imageUrl = result.secure_url;
        imagePublicId = result.public_id;
      } catch (error) {
        logger.error("Error al subir imagen", error);
      }
    }

    // Buscar director de prensa
    const director = await db
      .select()
      .from(users)
      .where(eq(users.role, ROLES.DIRECTOR_PRENSA))
      .limit(1);

    if (director.length === 0) {
      throw new AppError("No se encontró el director de prensa", 404);
    }

    const newsId = generateId("news");
    const newNews = {
      id: newsId,
      title,
      subtitle,
      slug,
      content,
      type,
      status: NEWS_STATUS.PENDING_DIRECTOR,
      authorId: userId,
      imageUrl,
      imagePublicId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.insert(news).values(newNews);

    // Notificar al director
    await notificationService.createNotification({
      userId: director[0].id,
      type: "court_submission",
      title: `Nuevo ${type} de juzgado`,
      message: `${user[0].fullName} ha enviado un ${type} para publicación`,
      entityType: "news",
      entityId: newsId,
    });

    logger.info("Aviso/Comunicado enviado desde juzgado", {
      newsId,
      type,
      userId,
      slug,
    });

    return this.getById(newsId);
  }
}
export default new NewsService();
