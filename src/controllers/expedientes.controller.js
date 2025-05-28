import expedientesService from "../services/expedientes.service.js";
import { formatResponse } from "../utils/helpers.js";

export const create = async (req, res) => {
  const expediente = await expedientesService.create(req.body, req.user.id);
  res
    .status(201)
    .json(formatResponse(expediente, "Expediente creado exitosamente"));
};

export const update = async (req, res) => {
  const expediente = await expedientesService.update(
    req.params.id,
    req.body,
    req.user.id
  );
  res.json(formatResponse(expediente, "Expediente actualizado exitosamente"));
};

export const remove = async (req, res) => {
  await expedientesService.delete(req.params.id, req.user.id);
  res.json(formatResponse(null, "Expediente eliminado exitosamente"));
};

export const getById = async (req, res) => {
  const expediente = await expedientesService.getById(req.params.id);
  res.json(formatResponse(expediente, "Expediente obtenido"));
};

export const getList = async (req, res) => {
  const { search, status, departmentId } = req.query;
  const { page, limit } = req.validatedQuery || req.query;

  const filters = { search, status, departmentId };
  const result = await expedientesService.getList(
    filters,
    { page, limit },
    req.user.id,
    req.user.role
  );

  res.json(result);
};

export const submit = async (req, res) => {
  const { comments } = req.body;
  const expediente = await expedientesService.submit(
    req.params.id,
    req.user.id,
    comments
  );
  res.json(formatResponse(expediente, "Expediente enviado para aprobación"));
};

export const approve = async (req, res) => {
  const { comments } = req.body;
  const expediente = await expedientesService.approve(
    req.params.id,
    req.user.id,
    comments
  );
  res.json(formatResponse(expediente, "Expediente aprobado"));
};

export const reject = async (req, res) => {
  const { comments } = req.body;
  const expediente = await expedientesService.reject(
    req.params.id,
    req.user.id,
    comments
  );
  res.json(formatResponse(expediente, "Expediente rechazado"));
};

export const returnForRevision = async (req, res) => {
  const { comments } = req.body;
  const expediente = await expedientesService.returnForRevision(
    req.params.id,
    req.user.id,
    comments
  );
  res.json(formatResponse(expediente, "Expediente devuelto para revisión"));
};

export const getApprovalHistory = async (req, res) => {
  const history = await expedientesService.getApprovalHistory(req.params.id);
  res.json(formatResponse(history, "Historial de aprobación obtenido"));
};

export const getStatistics = async (req, res) => {
  const stats = await expedientesService.getStatistics(
    req.user.id,
    req.user.role,
    req.user.departmentId
  );
  res.json(formatResponse(stats, "Estadísticas obtenidas"));
};
