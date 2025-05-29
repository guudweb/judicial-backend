import notificationService from "../services/notification.service.js";
import { formatResponse } from "../utils/helpers.js";

export const getList = async (req, res) => {
  const { status, type, startDate, endDate } = req.query;
  const { page, limit } = req.validatedQuery || req.query;

  const filters = { status, type, startDate, endDate };
  const result = await notificationService.getList(req.user.id, filters, {
    page,
    limit,
  });

  res.json(result);
};

export const getById = async (req, res) => {
  const notification = await notificationService.getById(
    req.params.id,
    req.user.id
  );
  res.json(formatResponse(notification, "Notificación obtenida"));
};

export const markAsRead = async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user.id
  );
  res.json(formatResponse(notification, "Notificación marcada como leída"));
};

export const markMultipleAsRead = async (req, res) => {
  const { ids } = req.body;
  const result = await notificationService.markMultipleAsRead(ids, req.user.id);
  res.json(formatResponse(result, "Notificaciones marcadas como leídas"));
};

export const deleteNotification = async (req, res) => {
  await notificationService.deleteNotification(req.params.id, req.user.id);
  res.json(formatResponse(null, "Notificación eliminada"));
};

export const getUnreadCount = async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);
  res.json(formatResponse({ count }, "Contador obtenido"));
};

export const updatePreferences = async (req, res) => {
  const preferences = await notificationService.updatePreferences(
    req.user.id,
    req.body
  );
  res.json(formatResponse(preferences, "Preferencias actualizadas"));
};
