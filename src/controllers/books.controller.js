import booksService from "../services/books.service.js";
import { formatResponse } from "../utils/helpers.js";

export const create = async (req, res) => {
  const book = await booksService.create(req.body, req.files, req.user.id);
  res.status(201).json(formatResponse(book, "Libro creado exitosamente"));
};

export const update = async (req, res) => {
  const book = await booksService.update(
    req.params.id,
    req.body,
    req.files,
    req.user.id
  );
  res.json(formatResponse(book, "Libro actualizado exitosamente"));
};

export const remove = async (req, res) => {
  await booksService.delete(req.params.id, req.user.id);
  res.json(formatResponse(null, "Libro eliminado exitosamente"));
};

export const getById = async (req, res) => {
  const book = await booksService.getById(req.params.id, true);
  res.json(formatResponse(book, "Libro obtenido"));
};

export const getList = async (req, res) => {
  const { search, type, tag, showPrivate } = req.query;
  const { page, limit } = req.validatedQuery || req.query;

  // Solo admins pueden ver libros privados
  const filters = {
    search,
    type,
    tag,
    showPrivate: showPrivate && req.user?.role === "admin",
  };

  const result = await booksService.getList(filters, { page, limit });
  res.json(result);
};

export const getPublicList = async (req, res) => {
  const { search, type, tag } = req.query;
  const { page, limit } = req.validatedQuery || req.query;

  const filters = { search, type, tag, showPrivate: false };
  const result = await booksService.getList(filters, { page, limit });

  res.json(result);
};

export const getDownloadUrl = async (req, res) => {
  const result = await booksService.getDownloadUrl(
    req.params.id,
    req.user?.id || "anonymous"
  );
  res.json(formatResponse(result, "URL de descarga generada"));
};

export const getStatistics = async (req, res) => {
  const stats = await booksService.getStatistics();
  res.json(formatResponse(stats, "Estadísticas obtenidas"));
};

export const getPopularTags = async (req, res) => {
  const { limit = 20 } = req.query;
  const tags = await booksService.getPopularTags(parseInt(limit));
  res.json(formatResponse(tags, "Tags populares obtenidos"));
};
