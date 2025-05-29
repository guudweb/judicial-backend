export const ROLES = {
  ADMIN: "admin",
  PRESIDENTE_CSPJ: "presidente_cspj",
  VICEPRESIDENTE_CSPJ: "vicepresidente_cspj", // Añadir este
  SECRETARIO_GENERAL: "secretario_general",
  SECRETARIO_ADJUNTO: "secretario_adjunto",
  PRESIDENTE_AUDIENCIA: "presidente_audiencia",
  JUEZ: "juez",
  TECNICO_PRENSA: "tecnico_prensa",
  DIRECTOR_PRENSA: "director_prensa",
  CIUDADANO: "ciudadano",
};

export const EXPEDIENTE_STATUS = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const EXPEDIENTE_LEVELS = {
  JUEZ: "juez",
  PRESIDENTE_AUDIENCIA: "presidente_audiencia",
  SECRETARIO_GENERAL: "secretario_general",
};

export const NEWS_STATUS = {
  DRAFT: "draft",
  PENDING_DIRECTOR: "pending_director_approval",
  PENDING_PRESIDENT: "pending_president_approval",
  PUBLISHED: "published",
};

export const NEWS_TYPES = {
  NOTICIA: "noticia",
  AVISO: "aviso",
  COMUNICADO: "comunicado",
};

export const APPROVAL_ACTIONS = {
  SUBMIT: "submit",
  APPROVE: "approve",
  REJECT: "reject",
  RETURN: "return_for_revision",
};

export const CONTACT_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
};

export const BOOK_TYPES = {
  TRATADO: "tratado",
  MANUAL: "manual",
  CODIGO_LEGAL: "codigo_legal",
  LIBRO: "libro",
};

export const ALLOWED_BOOK_FORMATS = [".pdf", ".epub", ".doc", ".docx"];

export const DEPARTMENT_TYPES = {
  CSPJ: "cspj",
  CORTE_SUPREMA: "corte_suprema",
  AUDIENCIA: "audiencia_provincial",
  JUZGADO: "juzgado",
  SECRETARIA: "secretaria",
  DIRECCION: "direccion",
};
