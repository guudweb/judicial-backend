import newsService from "../services/news.service.js";
import { formatResponse } from "../utils/helpers.js";

export const create = async (req, res) => {
  const news = await newsService.create(
    req.body,
    req.user.id,
    req.file || null
  );
  res.status(201).json(formatResponse(news, "Noticia creada exitosamente"));
};

export const update = async (req, res) => {
  const news = await newsService.update(
    req.params.id,
    req.body,
    req.user.id,
    req.file || null
  );
  res.json(formatResponse(news, "Noticia actualizada exitosamente"));
};

export const getBySlug = async (req, res) => {
  const news = await newsService.getBySlug(req.params.slug);
  res.json(formatResponse(news, "Noticia obtenida"));
};

export const remove = async (req, res) => {
  await newsService.delete(req.params.id, req.user.id);
  res.json(formatResponse(null, "Noticia eliminada exitosamente"));
};

export const getById = async (req, res) => {
  const news = await newsService.getById(req.params.id);
  res.json(formatResponse(news, "Noticia obtenida"));
};

export const getList = async (req, res) => {
  const { search, type, status, authorId } = req.query;
  const { page, limit } = req.validatedQuery || req.query;

  const filters = { search, type, status, authorId };
  const result = await newsService.getList(filters, { page, limit }, false);

  res.json(result);
};

export const getPublicList = async (req, res) => {
  const { search, type } = req.query;
  const { page, limit } = req.validatedQuery || req.query;

  const filters = { search, type };
  const result = await newsService.getList(filters, { page, limit }, true);

  res.json(result);
};

export const submitToDirector = async (req, res) => {
  const news = await newsService.submitToDirector(req.params.id, req.user.id);
  res.json(formatResponse(news, "Noticia enviada para revisión"));
};

export const approveByDirector = async (req, res) => {
  const { comments } = req.body;
  const news = await newsService.approveByDirector(
    req.params.id,
    req.user.id,
    comments
  );
  res.json(formatResponse(news, "Noticia aprobada por director"));
};

export const approveByPresident = async (req, res) => {
  const { comments } = req.body;
  const news = await newsService.approveByPresident(
    req.params.id,
    req.user.id,
    comments
  );
  res.json(formatResponse(news, "Noticia aprobada y publicada"));
};

export const reject = async (req, res) => {
  const { comments } = req.body;
  const result = await newsService.reject(req.params.id, req.user.id, comments);
  res.json(formatResponse(result, "Noticia rechazada"));
};

export const getStatistics = async (req, res) => {
  const stats = await newsService.getStatistics(req.user.id, req.user.role);
  res.json(formatResponse(stats, "Estadísticas obtenidas"));
};

export const submitFromCourt = async (req, res) => {
  const news = await newsService.submitFromCourt(
    req.body,
    req.user.id,
    req.file || null
  );
  res
    .status(201)
    .json(formatResponse(news, "Aviso/Comunicado enviado exitosamente"));
};

export const getApprovalHistory = async (req, res) => {
  const history = await newsService.getApprovalHistory(req.params.id);
  res.json(formatResponse(history, "Historial de aprobación obtenido"));
};
