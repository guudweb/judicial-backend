import departmentsService from "../services/departments.service.js";
import { formatResponse } from "../utils/helpers.js";

export const create = async (req, res) => {
  const department = await departmentsService.create(req.body, req.user.id);
  res
    .status(201)
    .json(formatResponse(department, "Departamento creado exitosamente"));
};

export const update = async (req, res) => {
  const department = await departmentsService.update(
    req.params.id,
    req.body,
    req.user.id
  );
  res.json(formatResponse(department, "Departamento actualizado exitosamente"));
};

export const toggleStatus = async (req, res) => {
  const department = await departmentsService.toggleStatus(
    req.params.id,
    req.user.id
  );
  res.json(
    formatResponse(
      department,
      department.isActive ? "Departamento activado" : "Departamento desactivado"
    )
  );
};

export const getById = async (req, res) => {
  const department = await departmentsService.getById(req.params.id);
  res.json(formatResponse(department, "Departamento obtenido"));
};

export const getList = async (req, res) => {
  const { search, type, isActive, parentId } = req.query;
  const { page, limit } = req.validatedQuery || req.query;

  const filters = {
    search,
    type,
    isActive: isActive !== undefined ? isActive === "true" : undefined,
    parentId: parentId === "null" ? null : parentId,
  };

  const result = await departmentsService.getList(filters, { page, limit });
  res.json(result);
};

export const getStatistics = async (req, res) => {
  const stats = await departmentsService.getStatistics();
  res.json(formatResponse(stats, "Estadísticas obtenidas"));
};

export const getTree = async (req, res) => {
  const tree = await departmentsService.getDepartmentTree();
  res.json(formatResponse(tree, "Árbol de departamentos obtenido"));
};

export const reorder = async (req, res) => {
  const { orders } = req.body;
  const result = await departmentsService.reorderDepartments(
    orders,
    req.user.id
  );
  res.json(formatResponse(result, "Departamentos reordenados"));
};

// Endpoint público para selects
export const getPublicList = async (req, res) => {
  const departments = await departmentsService.getList(
    { isActive: true },
    { page: 1, limit: 100 }
  );

  // Simplificar respuesta para uso público
  const simplified = departments.data.map((dept) => ({
    id: dept.id,
    name: dept.name,
    type: dept.type,
    parentId: dept.parentId,
  }));

  res.json(formatResponse(simplified, "Departamentos activos"));
};
