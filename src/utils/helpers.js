import crypto from "crypto";

export const generateId = (prefix = "") => {
  const timestamp = Date.now().toString(36);
  const randomStr = crypto.randomBytes(8).toString("hex");
  return prefix
    ? `${prefix}_${timestamp}${randomStr}`
    : `${timestamp}${randomStr}`;
};

export const paginate = (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  return { limit: parseInt(limit), offset };
};

export const formatResponse = (data, message = "Éxito") => {
  return {
    success: true,
    message,
    data,
  };
};

export const formatPaginatedResponse = (data, page, limit, total) => {
  return {
    success: true,
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const generateSlug = (text) => {
  return text
    .toLowerCase()
    .normalize("NFD") // Normalizar caracteres Unicode
    .replace(/[\u0300-\u036f]/g, "") // Remover diacríticos
    .replace(/[^a-z0-9\s-]/g, "") // Remover caracteres especiales
    .trim()
    .replace(/\s+/g, "-") // Reemplazar espacios con guiones
    .replace(/-+/g, "-") // Reemplazar múltiples guiones con uno solo
    .substring(0, 100); // Limitar longitud
};

export const generateUniqueSlug = async (baseSlug, checkFunction) => {
  let slug = baseSlug;
  let counter = 1;

  while (await checkFunction(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};
