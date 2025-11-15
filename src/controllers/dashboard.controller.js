import dashboardService from "../services/dashboard.service.js";
import { formatResponse } from "../utils/helpers.js";

export const getPendingTasks = async (req, res) => {
  const tasks = await dashboardService.getPendingTasks(
    req.user.id,
    req.user.role,
    req.user.departmentId
  );
  res.json(formatResponse(tasks, "Tareas pendientes obtenidas"));
};

export const getSummary = async (req, res) => {
  const { period = "week" } = req.query;
  const summary = await dashboardService.getSummary(
    req.user.id,
    req.user.role,
    req.user.departmentId,
    period
  );
  res.json(formatResponse(summary, "Resumen del dashboard obtenido"));
};

export const getRecentActivity = async (req, res) => {
  const { limit = 10 } = req.query;
  const activity = await dashboardService.getRecentActivity(
    req.user.id,
    req.user.role,
    req.user.departmentId,
    parseInt(limit)
  );
  res.json(formatResponse(activity, "Actividad reciente obtenida"));
};

export const getStatsByRole = async (req, res) => {
  const stats = await dashboardService.getStatsByRole(
    req.user.id,
    req.user.role,
    req.user.departmentId
  );
  res.json(formatResponse(stats, "Estadísticas por rol obtenidas"));
};
