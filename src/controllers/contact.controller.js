import contactService from "../services/contact.service.js";
import { formatResponse } from "../utils/helpers.js";

export const create = async (req, res) => {
  const result = await contactService.create(req.body, req.file || null);
  res.status(201).json(formatResponse(result, "Mensaje enviado exitosamente"));
};

export const getById = async (req, res) => {
  const contact = await contactService.getById(req.params.id, req.user.id);
  res.json(formatResponse(contact, "Mensaje obtenido"));
};

export const getList = async (req, res) => {
  const { search, status, assignedTo } = req.query;
  const { page, limit } = req.validatedQuery || req.query;

  const filters = { search, status, assignedTo };
  const result = await contactService.getList(
    filters,
    { page, limit },
    req.user.id
  );

  res.json(result);
};

export const updateStatus = async (req, res) => {
  const { status } = req.body;
  const contact = await contactService.updateStatus(
    req.params.id,
    status,
    req.user.id
  );
  res.json(formatResponse(contact, "Estado actualizado"));
};

export const assign = async (req, res) => {
  const { userId } = req.body;
  const contact = await contactService.assign(
    req.params.id,
    userId,
    req.user.id
  );
  res.json(formatResponse(contact, "Mensaje asignado exitosamente"));
};

export const respond = async (req, res) => {
  const { response } = req.body;
  const result = await contactService.addResponse(
    req.params.id,
    response,
    req.user.id
  );
  res.json(formatResponse(result, "Respuesta enviada"));
};

export const getStatistics = async (req, res) => {
  const stats = await contactService.getStatistics(req.user.id);
  res.json(formatResponse(stats, "Estadísticas obtenidas"));
};
