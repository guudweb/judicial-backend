import auditService from "../services/audit.service.js";
import { formatResponse } from "../utils/helpers.js";

export const getLogs = async (req, res) => {
  // Usar los valores originales de req.query para los filtros
  const { userId, action, entityType, entityId, startDate, endDate } =
    req.query;

  // Usar los valores validados para paginación
  const { page, limit } = req.validatedQuery || req.query;

  const filters = {
    userId,
    action,
    entityType,
    entityId,
    startDate,
    endDate,
  };

  const result = await auditService.getLogs(filters, { page, limit });
  res.json(result);
};

export const getUserActivity = async (req, res) => {
  const { userId } = req.params;
  const { days = 30 } = req.query;

  const activity = await auditService.getUserActivity(userId, parseInt(days));
  res.json(formatResponse(activity, "Actividad del usuario obtenida"));
};

export const getEntityHistory = async (req, res) => {
  const { entityType, entityId } = req.params;

  const history = await auditService.getEntityHistory(entityType, entityId);
  res.json(formatResponse(history, "Historial de la entidad obtenido"));
};

export const getStatistics = async (req, res) => {
  const { startDate, endDate } = req.query;

  const start =
    startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = endDate || new Date().toISOString();

  const stats = await auditService.getStatistics(start, end);
  res.json(formatResponse(stats, "Estadísticas obtenidas"));
};
