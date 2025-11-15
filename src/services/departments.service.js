import { db, departments, users, expedientes } from "../db/index.js";
import { eq, and, or, desc, asc, like, sql, ne, isNull } from "drizzle-orm";
import { generateId, formatPaginatedResponse } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import { DEPARTMENT_TYPES } from "../utils/constants.js";
import logger from "../utils/logger.js";

class DepartmentsService {
  // Departamentos base que no se pueden eliminar
  PROTECTED_DEPARTMENTS = ["dep_cspj", "dep_corte"];

  async create(data, userId) {
    const { name, type, parentId, location, orderIndex, metadata } = data;

    // Verificar que el nombre no exista
    const existing = await db
      .select()
      .from(departments)
      .where(eq(departments.name, name))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError("Ya existe un departamento con ese nombre", 409);
    }

    // Validar parentId si se proporciona
    if (parentId) {
      const parent = await db
        .select()
        .from(departments)
        .where(eq(departments.id, parentId))
        .limit(1);

      if (parent.length === 0) {
        throw new AppError("Departamento padre no encontrado", 404);
      }

      // Evitar ciclos - verificar que el padre no sea descendiente
      await this.checkForCycles(parentId, null);
    }

    const departmentId = generateId("dep");
    const newDepartment = {
      id: departmentId,
      name,
      type: type || DEPARTMENT_TYPES.AUDIENCIA,
      parentId,
      location,
      orderIndex: orderIndex || 0,
      metadata: metadata ? JSON.stringify(metadata) : null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.insert(departments).values(newDepartment);

    logger.info("Departamento creado", {
      departmentId,
      name,
      type,
      createdBy: userId,
    });

    return this.getById(departmentId);
  }

  async update(departmentId, data, userId) {
    // Verificar que existe
    const department = await this.getById(departmentId);

    // No permitir modificar departamentos protegidos (excepto algunos campos)
    if (this.PROTECTED_DEPARTMENTS.includes(departmentId)) {
      const allowedFields = ["location", "metadata", "orderIndex"];
      const hasRestrictedFields = Object.keys(data).some(
        (key) => !allowedFields.includes(key)
      );

      if (hasRestrictedFields) {
        throw new AppError(
          "Este departamento base solo permite modificar ubicación, orden y metadata",
          403
        );
      }
    }

    const { name, type, parentId, location, orderIndex, metadata } = data;
    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    // Validar nombre único si cambia
    if (name && name !== department.name) {
      const existing = await db
        .select()
        .from(departments)
        .where(
          and(eq(departments.name, name), ne(departments.id, departmentId))
        )
        .limit(1);

      if (existing.length > 0) {
        throw new AppError("Ya existe un departamento con ese nombre", 409);
      }
      updateData.name = name;
    }

    // Validar parentId si cambia
    if (parentId !== undefined && parentId !== department.parentId) {
      if (parentId) {
        // No puede ser su propio padre
        if (parentId === departmentId) {
          throw new AppError(
            "Un departamento no puede ser su propio padre",
            400
          );
        }

        // Verificar que el padre existe
        const parent = await db
          .select()
          .from(departments)
          .where(eq(departments.id, parentId))
          .limit(1);

        if (parent.length === 0) {
          throw new AppError("Departamento padre no encontrado", 404);
        }

        // Evitar ciclos
        await this.checkForCycles(parentId, departmentId);
      }
      updateData.parentId = parentId;
    }

    // Actualizar otros campos si se proporcionan
    if (type !== undefined) updateData.type = type;
    if (location !== undefined) updateData.location = location;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (metadata !== undefined) {
      updateData.metadata = metadata ? JSON.stringify(metadata) : null;
    }

    await db
      .update(departments)
      .set(updateData)
      .where(eq(departments.id, departmentId));

    logger.info("Departamento actualizado", {
      departmentId,
      updatedBy: userId,
      changes: Object.keys(updateData),
    });

    return this.getById(departmentId);
  }

  async toggleStatus(departmentId, userId) {
    const department = await this.getById(departmentId);

    // No permitir desactivar departamentos protegidos
    if (this.PROTECTED_DEPARTMENTS.includes(departmentId)) {
      throw new AppError(
        "No se pueden desactivar departamentos base del sistema",
        403
      );
    }

    // Si se va a desactivar, verificar que no tenga dependencias activas
    if (department.isActive) {
      // Verificar usuarios activos
      const activeUsers = await db
        .select({ count: sql`count(*)` })
        .from(users)
        .where(
          and(eq(users.departmentId, departmentId), eq(users.isActive, true))
        );

      if (activeUsers[0].count > 0) {
        throw new AppError(
          `No se puede desactivar: hay ${activeUsers[0].count} usuarios activos en este departamento`,
          400
        );
      }

      // Verificar expedientes pendientes
      const pendingExpedientes = await db
        .select({ count: sql`count(*)` })
        .from(expedientes)
        .where(
          and(
            eq(expedientes.departmentId, departmentId),
            ne(expedientes.status, "approved")
          )
        );

      if (pendingExpedientes[0].count > 0) {
        throw new AppError(
          `No se puede desactivar: hay ${pendingExpedientes[0].count} expedientes pendientes`,
          400
        );
      }

      // Verificar subdepartamentos activos
      const activeSubdepts = await db
        .select({ count: sql`count(*)` })
        .from(departments)
        .where(
          and(
            eq(departments.parentId, departmentId),
            eq(departments.isActive, true)
          )
        );

      if (activeSubdepts[0].count > 0) {
        throw new AppError(
          `No se puede desactivar: hay ${activeSubdepts[0].count} subdepartamentos activos`,
          400
        );
      }
    }

    const newStatus = !department.isActive;

    await db
      .update(departments)
      .set({
        isActive: newStatus,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(departments.id, departmentId));

    logger.info("Estado de departamento cambiado", {
      departmentId,
      newStatus,
      changedBy: userId,
    });

    return {
      ...department,
      isActive: newStatus,
    };
  }

  async getById(departmentId) {
    const result = await db
      .select({
        department: departments,
        parent: {
          id: sql`p.id`,
          name: sql`p.name`,
        },
      })
      .from(departments)
      .leftJoin(sql`departments as p`, eq(departments.parentId, sql`p.id`))
      .where(eq(departments.id, departmentId))
      .limit(1);

    if (result.length === 0) {
      throw new AppError("Departamento no encontrado", 404);
    }

    // Parsear metadata
    const dept = result[0].department;
    let parsedMetadata = null;
    if (dept.metadata) {
      try {
        parsedMetadata = JSON.parse(dept.metadata);
      } catch (e) {
        parsedMetadata = dept.metadata;
      }
    }

    // Obtener estadísticas
    const stats = await this.getDepartmentStats(departmentId);

    return {
      ...dept,
      metadata: parsedMetadata,
      parent: result[0].parent.id ? result[0].parent : null,
      statistics: stats,
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
          like(departments.name, `%${filters.search}%`),
          like(departments.location, `%${filters.search}%`)
        )
      );
    }

    if (filters.type) {
      conditions.push(eq(departments.type, filters.type));
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(departments.isActive, filters.isActive));
    }

    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        conditions.push(isNull(departments.parentId));
      } else {
        conditions.push(eq(departments.parentId, filters.parentId));
      }
    }

    const query = db
      .select({
        department: departments,
        parent: {
          id: sql`p.id`,
          name: sql`p.name`,
        },
      })
      .from(departments)
      .leftJoin(sql`departments as p`, eq(departments.parentId, sql`p.id`))
      .orderBy(asc(departments.orderIndex), asc(departments.name))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    const result = await query;

    // Contar total
    const countQuery = db.select({ count: sql`count(*)` }).from(departments);

    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }

    const [{ count }] = await countQuery;

    // Parsear metadata y obtener estadísticas básicas
    const departmentsWithData = await Promise.all(
      result.map(async (r) => {
        let parsedMetadata = null;
        if (r.department.metadata) {
          try {
            parsedMetadata = JSON.parse(r.department.metadata);
          } catch (e) {
            parsedMetadata = r.department.metadata;
          }
        }

        const stats = await this.getDepartmentStats(r.department.id);

        return {
          ...r.department,
          metadata: parsedMetadata,
          parent: r.parent.id ? r.parent : null,
          userCount: stats.users.total,
          expedienteCount: stats.expedientes.total,
        };
      })
    );

    return formatPaginatedResponse(
      departmentsWithData,
      page,
      limit,
      Number(count)
    );
  }

  async getDepartmentStats(departmentId) {
    // Usuarios
    const userStats = await db
      .select({
        total: sql`count(*)`,
        active: sql`sum(case when is_active = 1 then 1 else 0 end)`,
      })
      .from(users)
      .where(eq(users.departmentId, departmentId));

    // Expedientes
    const expedienteStats = await db
      .select({
        status: expedientes.status,
        count: sql`count(*)`,
      })
      .from(expedientes)
      .where(eq(expedientes.departmentId, departmentId))
      .groupBy(expedientes.status);

    const expedientesByStatus = expedienteStats.reduce((acc, curr) => {
      acc[curr.status] = Number(curr.count);
      return acc;
    }, {});

    return {
      users: {
        total: Number(userStats[0].total),
        active: Number(userStats[0].active || 0),
      },
      expedientes: {
        total: expedienteStats.reduce((sum, s) => sum + Number(s.count), 0),
        byStatus: expedientesByStatus,
      },
    };
  }

  async getStatistics() {
    // Total general
    const [{ total }] = await db
      .select({ total: sql`count(*)` })
      .from(departments);

    const [{ active }] = await db
      .select({ active: sql`count(*)` })
      .from(departments)
      .where(eq(departments.isActive, true));

    // Por tipo
    const byType = await db
      .select({
        type: departments.type,
        count: sql`count(*)`,
      })
      .from(departments)
      .groupBy(departments.type);

    // Árbol jerárquico
    const hierarchy = await this.getDepartmentTree();

    return {
      total: Number(total),
      active: Number(active),
      inactive: Number(total) - Number(active),
      byType: byType.reduce((acc, curr) => {
        acc[curr.type] = Number(curr.count);
        return acc;
      }, {}),
      hierarchy,
    };
  }

  async getDepartmentTree(parentId = null) {
    const depts = await db
      .select()
      .from(departments)
      .where(
        parentId
          ? eq(departments.parentId, parentId)
          : isNull(departments.parentId)
      )
      .orderBy(asc(departments.orderIndex), asc(departments.name));

    const tree = await Promise.all(
      depts.map(async (dept) => {
        const children = await this.getDepartmentTree(dept.id);
        const stats = await this.getDepartmentStats(dept.id);

        return {
          ...dept,
          children,
          userCount: stats.users.total,
          hasActiveUsers: stats.users.active > 0,
        };
      })
    );

    return tree;
  }

  async checkForCycles(parentId, currentId) {
    // Verificar que el nuevo padre no sea descendiente del departamento actual
    if (!currentId) return;

    let current = parentId;
    const visited = new Set();

    while (current) {
      if (visited.has(current)) {
        throw new AppError("Se detectó un ciclo en la jerarquía", 400);
      }

      if (current === currentId) {
        throw new AppError(
          "No se puede crear una relación circular en la jerarquía",
          400
        );
      }

      visited.add(current);

      const parent = await db
        .select({ parentId: departments.parentId })
        .from(departments)
        .where(eq(departments.id, current))
        .limit(1);

      current = parent[0]?.parentId;
    }
  }

  async reorderDepartments(orders, userId) {
    // orders = [{ id: 'dep_xxx', orderIndex: 0 }, ...]

    const updates = orders.map(({ id, orderIndex }) =>
      db
        .update(departments)
        .set({
          orderIndex,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(departments.id, id))
    );

    await Promise.all(updates);

    logger.info("Departamentos reordenados", {
      count: orders.length,
      reorderedBy: userId,
    });

    return { success: true, updated: orders.length };
  }
}

export default new DepartmentsService();
