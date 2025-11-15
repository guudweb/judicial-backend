import cloudinary from "../config/cloudinary.js";
import { db, books, users } from "../db/index.js";
import { eq, and, or, desc, asc, like, sql, inArray } from "drizzle-orm";
import { generateId, formatPaginatedResponse } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import { BOOK_TYPES, ROLES } from "../utils/constants.js";
import logger from "../utils/logger.js";

class BooksService {
  async create(data, files, userId) {
    const { title, description, author, tags, type } = data;

    // Validar tipo de libro
    if (!Object.values(BOOK_TYPES).includes(type)) {
      throw new AppError("Tipo de libro inválido", 400);
    }

    // Verificar que se proporcionó el archivo del libro
    if (!files.file || files.file.length === 0) {
      throw new AppError("El archivo del libro es requerido", 400);
    }

    const bookFile = files.file[0];
    let coverImageUrl = null;
    let coverImagePublicId = null;

    // Subir imagen de portada si se proporciona
    if (files.cover && files.cover.length > 0) {
      try {
        const coverResult = await this.uploadCoverImage(files.cover[0], title);
        coverImageUrl = coverResult.secure_url;
        coverImagePublicId = coverResult.public_id;
      } catch (error) {
        logger.error("Error al subir portada", error);
        // Continuar sin portada
      }
    }

    // Subir archivo del libro
    let fileResult;
    try {
      fileResult = await this.uploadBookFile(bookFile, title);
    } catch (error) {
      // Si falla, eliminar la portada si se subió
      if (coverImagePublicId) {
        await cloudinary.uploader.destroy(coverImagePublicId);
      }
      throw new AppError("Error al subir el archivo del libro", 500);
    }

    // Parsear tags si vienen como string
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags;
      } catch {
        parsedTags = tags.split(",").map((t) => t.trim());
      }
    }

    const bookId = generateId("book");
    const newBook = {
      id: bookId,
      title,
      description,
      author,
      tags: JSON.stringify(parsedTags),
      type,
      coverImageUrl,
      coverImagePublicId,
      fileUrl: fileResult.secure_url,
      filePublicId: fileResult.public_id,
      fileSize: fileResult.bytes,
      fileType: bookFile.mimetype,
      uploadedBy: userId,
      isPublic: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.insert(books).values(newBook);

    logger.info("Libro creado", { bookId, title, type, userId });

    return this.getById(bookId);
  }

  async update(bookId, data, files, userId) {
    const book = await this.getById(bookId);

    // Verificar permisos
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const canEdit =
      book.uploadedBy === userId ||
      user[0].role === ROLES.ADMIN ||
      user[0].role === ROLES.SECRETARIO_GENERAL;

    if (!canEdit) {
      throw new AppError("No tienes permisos para editar este libro", 403);
    }

    const { title, description, author, tags, type } = data;
    let updateData = {
      title,
      description,
      author,
      type,
      updatedAt: new Date().toISOString(),
    };

    // Actualizar tags
    if (tags) {
      let parsedTags = [];
      try {
        parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags;
      } catch {
        parsedTags = tags.split(",").map((t) => t.trim());
      }
      updateData.tags = JSON.stringify(parsedTags);
    }

    // Actualizar portada si se proporciona nueva
    if (files && files.cover && files.cover.length > 0) {
      // Eliminar portada anterior si existe
      if (book.coverImagePublicId) {
        try {
          await cloudinary.uploader.destroy(book.coverImagePublicId);
        } catch (error) {
          logger.error("Error al eliminar portada anterior", error);
        }
      }

      try {
        const coverResult = await this.uploadCoverImage(files.cover[0], title);
        updateData.coverImageUrl = coverResult.secure_url;
        updateData.coverImagePublicId = coverResult.public_id;
      } catch (error) {
        logger.error("Error al subir nueva portada", error);
      }
    }

    // Actualizar archivo si se proporciona nuevo
    if (files && files.file && files.file.length > 0) {
      // Eliminar archivo anterior
      if (book.filePublicId) {
        try {
          await cloudinary.uploader.destroy(book.filePublicId, {
            resource_type: "raw",
          });
        } catch (error) {
          logger.error("Error al eliminar archivo anterior", error);
        }
      }

      try {
        const fileResult = await this.uploadBookFile(files.file[0], title);
        updateData.fileUrl = fileResult.secure_url;
        updateData.filePublicId = fileResult.public_id;
        updateData.fileSize = fileResult.bytes;
        updateData.fileType = files.file[0].mimetype;
      } catch (error) {
        throw new AppError("Error al subir el nuevo archivo", 500);
      }
    }

    await db.update(books).set(updateData).where(eq(books.id, bookId));

    logger.info("Libro actualizado", { bookId, userId });

    return this.getById(bookId);
  }

  async delete(bookId, userId) {
    const book = await this.getById(bookId);

    // Verificar permisos
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const canDelete =
      book.uploadedBy === userId || user[0].role === ROLES.ADMIN;

    if (!canDelete) {
      throw new AppError("No tienes permisos para eliminar este libro", 403);
    }

    // Eliminar archivos de Cloudinary
    try {
      if (book.coverImagePublicId) {
        await cloudinary.uploader.destroy(book.coverImagePublicId);
      }
      if (book.filePublicId) {
        await cloudinary.uploader.destroy(book.filePublicId, {
          resource_type: "raw",
        });
      }
    } catch (error) {
      logger.error("Error al eliminar archivos de Cloudinary", error);
    }

    await db.delete(books).where(eq(books.id, bookId));

    logger.info("Libro eliminado", { bookId, userId });

    return { success: true };
  }

  async getById(bookId, incrementView = false) {
    const result = await db
      .select({
        book: books,
        uploader: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
      })
      .from(books)
      .leftJoin(users, eq(books.uploadedBy, users.id))
      .where(eq(books.id, bookId))
      .limit(1);

    if (result.length === 0) {
      throw new AppError("Libro no encontrado", 404);
    }

    // Incrementar contador de vistas
    if (incrementView) {
      await db
        .update(books)
        .set({
          viewCount: sql`${books.viewCount} + 1`,
        })
        .where(eq(books.id, bookId));
    }

    // Parsear tags
    const book = result[0].book;
    let parsedTags = [];
    try {
      parsedTags = JSON.parse(book.tags || "[]");
    } catch {
      parsedTags = [];
    }

    return {
      ...book,
      tags: parsedTags,
      uploader: result[0].uploader,
    };
  }

  async getList(filters, pagination) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    const conditions = [];

    // Filtros
    if (filters.search) {
      conditions.push(
        or(
          like(books.title, `%${filters.search}%`),
          like(books.author, `%${filters.search}%`),
          like(books.description, `%${filters.search}%`)
        )
      );
    }

    if (filters.type) {
      conditions.push(eq(books.type, filters.type));
    }

    if (filters.tag) {
      conditions.push(like(books.tags, `%${filters.tag}%`));
    }

    // Solo mostrar libros públicos a menos que sea admin
    if (!filters.showPrivate) {
      conditions.push(eq(books.isPublic, true));
    }

    const query = db
      .select({
        book: books,
        uploader: {
          id: users.id,
          fullName: users.fullName,
        },
      })
      .from(books)
      .leftJoin(users, eq(books.uploadedBy, users.id))
      .orderBy(desc(books.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    const result = await query;

    // Contar total
    const countQuery = db.select({ count: sql`count(*)` }).from(books);

    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }

    const [{ count }] = await countQuery;

    // Parsear tags para cada libro
    const booksWithParsedTags = result.map((r) => {
      let parsedTags = [];
      try {
        parsedTags = JSON.parse(r.book.tags || "[]");
      } catch {
        parsedTags = [];
      }

      return {
        ...r.book,
        tags: parsedTags,
        uploader: r.uploader,
      };
    });

    return formatPaginatedResponse(
      booksWithParsedTags,
      page,
      limit,
      Number(count)
    );
  }

  async getDownloadUrl(bookId, userId) {
    const book = await this.getById(bookId);

    // Incrementar contador de descargas
    await db
      .update(books)
      .set({
        downloadCount: sql`${books.downloadCount} + 1`,
      })
      .where(eq(books.id, bookId));

    // Generar URL firmada correctamente
    const timestamp = Math.floor(Date.now() / 1000);
    const expiresAt = timestamp + 3600; // 1 hora
    
    const downloadUrl = cloudinary.url(book.filePublicId, {
      resource_type: "raw",
      type: "upload",
      attachment: true,
      expires_at: expiresAt,
      sign_url: true,
      secure: true
    });

    logger.info("Descarga de libro", { bookId, userId, title: book.title });

    return {
      url: downloadUrl,
      filename: `${book.title}.${book.fileType.split("/").pop()}`,
      expiresIn: 3600,
    };
  }

  async getStatistics() {
    // Total de libros por tipo
    const byType = await db
      .select({
        type: books.type,
        count: sql`count(*)`,
      })
      .from(books)
      .groupBy(books.type);

    // Libros más vistos
    const mostViewed = await db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        viewCount: books.viewCount,
      })
      .from(books)
      .orderBy(desc(books.viewCount))
      .limit(10);

    // Libros más descargados
    const mostDownloaded = await db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        downloadCount: books.downloadCount,
      })
      .from(books)
      .orderBy(desc(books.downloadCount))
      .limit(10);

    // Total general
    const [{ total }] = await db.select({ total: sql`count(*)` }).from(books);

    const [{ totalViews }] = await db
      .select({ totalViews: sql`sum(view_count)` })
      .from(books);

    const [{ totalDownloads }] = await db
      .select({ totalDownloads: sql`sum(download_count)` })
      .from(books);

    return {
      total: Number(total),
      totalViews: Number(totalViews || 0),
      totalDownloads: Number(totalDownloads || 0),
      byType: byType.reduce((acc, curr) => {
        acc[curr.type] = Number(curr.count);
        return acc;
      }, {}),
      mostViewed,
      mostDownloaded,
    };
  }

  async uploadCoverImage(file, title) {
    const timestamp = Date.now();
    const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50);
    const publicId = `books/covers/${safeTitle}_${timestamp}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          public_id: publicId,
          folder: "judicial/books/covers",
          transformation: [
            { width: 400, height: 600, crop: "fill", gravity: "center" },
            { quality: "auto:good" },
            { fetch_format: "auto" },
          ],
          tags: ["libro_judicial", "portada"],
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

  async uploadBookFile(file, title) {
    const timestamp = Date.now();
    const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50);
    const publicId = `books/files/${safeTitle}_${timestamp}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          public_id: publicId,
          folder: "judicial/books/files",
          tags: ["libro_judicial", "archivo"],
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

  async getPopularTags(limit = 20) {
    // Obtener todos los libros y sus tags
    const allBooks = await db
      .select({
        tags: books.tags,
      })
      .from(books);

    // Contar frecuencia de tags
    const tagCount = {};

    allBooks.forEach((book) => {
      try {
        const tags = JSON.parse(book.tags || "[]");
        tags.forEach((tag) => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      } catch {
        // Ignorar errores de parseo
      }
    });

    // Ordenar y limitar
    const sortedTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));

    return sortedTags;
  }
}

export default new BooksService();
