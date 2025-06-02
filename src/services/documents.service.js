import cloudinary from "../config/cloudinary.js";
import { generateId } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import logger from "../utils/logger.js";
import expedientesService from "./expedientes.service.js";
import { db, documents, expedientes, users } from "../db/index.js";
import { eq, and, desc, or, inArray, sql } from "drizzle-orm";

class DocumentsService {
  async uploadDocument(file, expedienteId, userId) {
    try {
      // Verificar que el expediente existe y el usuario tiene acceso
      const expediente = await expedientesService.getById(expedienteId);

      // Verificar permisos: creador, asignado o roles superiores
      const hasAccess =
        expediente.createdBy === userId || expediente.assignedTo === userId;

      if (!hasAccess) {
        // Verificar si tiene un rol superior
        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        const superiorRoles = [
          "admin",
          "secretario_general",
          "presidente_cspj",
        ];
        if (!superiorRoles.includes(user[0].role)) {
          throw new AppError(
            "No tienes permisos para subir documentos a este expediente",
            403
          );
        }
      }

      // Preparar el nombre del archivo
      const timestamp = Date.now();
      const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
      const publicId = `expedientes/${expedienteId}/${timestamp}_${safeFileName}`;

      // Subir a Cloudinary
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "raw",
            public_id: publicId,
            folder: "judicial/expedientes",
            tags: [`expediente_${expedienteId}`, "documento_legal"],
            context: {
              expediente_id: expedienteId,
              uploaded_by: userId,
              original_name: file.originalname,
            },
          },
          (error, result) => {
            if (error) {
              logger.error("Error al subir a Cloudinary", error);
              reject(new AppError("Error al subir el documento", 500));
            } else {
              resolve(result);
            }
          }
        );

        uploadStream.end(file.buffer);
      });

      // Guardar referencia en base de datos
      const documentId = generateId("doc");
      const newDocument = {
        id: documentId,
        expedienteId,
        filename: file.originalname,
        cloudinaryUrl: result.secure_url,
        cloudinaryPublicId: result.public_id,
        fileSize: result.bytes,
        mimeType: file.mimetype,
        uploadedBy: userId,
        createdAt: new Date().toISOString(),
      };

      await db.insert(documents).values(newDocument);

      logger.info("Documento subido exitosamente", {
        documentId,
        expedienteId,
        userId,
        filename: file.originalname,
      });

      return newDocument;
    } catch (error) {
      logger.error("Error en uploadDocument", error);
      throw error;
    }
  }

  async deleteDocument(documentId, userId) {
    // Obtener información del documento
    const document = await db
      .select({
        doc: documents,
        expediente: {
          id: expedientes.id,
          createdBy: expedientes.createdBy,
          status: expedientes.status,
        },
      })
      .from(documents)
      .innerJoin(expedientes, eq(documents.expedienteId, expedientes.id))
      .where(eq(documents.id, documentId))
      .limit(1);

    if (document.length === 0) {
      throw new AppError("Documento no encontrado", 404);
    }

    const doc = document[0];

    // Verificar permisos
    if (doc.doc.uploadedBy !== userId && doc.expediente.createdBy !== userId) {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!["admin", "secretario_general"].includes(user[0].role)) {
        throw new AppError(
          "No tienes permisos para eliminar este documento",
          403
        );
      }
    }

    // No permitir eliminar documentos de expedientes aprobados
    if (doc.expediente.status === "approved") {
      throw new AppError(
        "No se pueden eliminar documentos de expedientes aprobados",
        400
      );
    }

    try {
      // Eliminar de Cloudinary
      await cloudinary.uploader.destroy(doc.doc.cloudinaryPublicId, {
        resource_type: "raw",
      });

      // Eliminar de base de datos
      await db.delete(documents).where(eq(documents.id, documentId));

      logger.info("Documento eliminado", { documentId, userId });

      return { success: true };
    } catch (error) {
      logger.error("Error al eliminar documento", error);
      throw new AppError("Error al eliminar el documento", 500);
    }
  }

  async getDocumentsByExpediente(expedienteId, userId) {
    // Verificar acceso al expediente
    await expedientesService.getById(expedienteId);

    const docs = await db
      .select({
        id: documents.id,
        filename: documents.filename,
        cloudinaryUrl: documents.cloudinaryUrl,
        fileSize: documents.fileSize,
        mimeType: documents.mimeType,
        uploadedBy: documents.uploadedBy,
        uploaderName: users.fullName,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(users, eq(documents.uploadedBy, users.id))
      .where(eq(documents.expedienteId, expedienteId))
      .orderBy(desc(documents.createdAt));

    return docs;
  }

  async getDocumentInfo(documentId) {
    const doc = await db
      .select({
        document: documents,
        uploader: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        },
        expediente: {
          id: expedientes.id,
          caseNumber: expedientes.caseNumber,
          title: expedientes.title,
        },
      })
      .from(documents)
      .leftJoin(users, eq(documents.uploadedBy, users.id))
      .leftJoin(expedientes, eq(documents.expedienteId, expedientes.id))
      .where(eq(documents.id, documentId))
      .limit(1);

    if (doc.length === 0) {
      throw new AppError("Documento no encontrado", 404);
    }

    return {
      ...doc[0].document,
      uploader: doc[0].uploader,
      expediente: doc[0].expediente,
    };
  }

  async generateSecureUrl(documentId, userId) {
    // Verificar que el usuario tiene acceso al documento
    const doc = await this.getDocumentInfo(documentId);

    // Generar URL firmada correctamente
    const timestamp = Math.floor(Date.now() / 1000);
    const expiresAt = timestamp + 3600; // 1 hora
    
    const secureUrl = cloudinary.url(doc.cloudinaryPublicId, {
      resource_type: "raw",
      type: "upload",
      attachment: true,
      expires_at: expiresAt,
      sign_url: true,
      secure: true
    });

    logger.info("URL segura generada", { documentId, userId });

    return {
      url: secureUrl,
      expiresIn: 3600,
      filename: doc.filename,
    };
  }

  async getStatistics(userId, userRole, departmentId) {
    const baseQuery = [];

    // Aplicar filtros según rol
    if (userRole === "juez") {
      // Solo documentos de sus expedientes
      const userExpedientes = await db
        .select({ id: expedientes.id })
        .from(expedientes)
        .where(
          or(
            eq(expedientes.createdBy, userId),
            eq(expedientes.assignedTo, userId)
          )
        );

      const expedienteIds = userExpedientes.map((e) => e.id);
      if (expedienteIds.length > 0) {
        baseQuery.push(inArray(documents.expedienteId, expedienteIds));
      }
    } else if (userRole === "presidente_audiencia" && departmentId) {
      // Documentos de expedientes del departamento
      const deptExpedientes = await db
        .select({ id: expedientes.id })
        .from(expedientes)
        .where(eq(expedientes.departmentId, departmentId));

      const expedienteIds = deptExpedientes.map((e) => e.id);
      if (expedienteIds.length > 0) {
        baseQuery.push(inArray(documents.expedienteId, expedienteIds));
      }
    }

    const query = baseQuery.length > 0 ? and(...baseQuery) : undefined;

    // Total de documentos
    const [{ total }] = await db
      .select({ total: sql`count(*)` })
      .from(documents)
      .where(query);

    // Tamaño total
    const [{ totalSize }] = await db
      .select({ totalSize: sql`coalesce(sum(file_size), 0)` })
      .from(documents)
      .where(query);

    // Documentos por tipo
    const byType = await db
      .select({
        mimeType: documents.mimeType,
        count: sql`count(*)`,
        totalSize: sql`sum(file_size)`,
      })
      .from(documents)
      .where(query)
      .groupBy(documents.mimeType);

    return {
      total: Number(total),
      totalSize: Number(totalSize),
      totalSizeMB: (Number(totalSize) / (1024 * 1024)).toFixed(2),
      byType: byType.map((t) => ({
        type: t.mimeType,
        count: Number(t.count),
        totalSize: Number(t.totalSize),
        totalSizeMB: (Number(t.totalSize) / (1024 * 1024)).toFixed(2),
      })),
    };
  }
}

export default new DocumentsService();
