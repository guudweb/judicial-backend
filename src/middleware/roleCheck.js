import { AppError } from "./errorHandler.js";
import { ROLES } from "../utils/constants.js";

// Middleware para verificar un rol específico
export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("No autorizado", 401));
    }

    if (req.user.role !== role) {
      return next(
        new AppError("No tienes permisos para realizar esta acción", 403)
      );
    }

    next();
  };
};

// Middleware para verificar múltiples roles
export const requireAnyRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("No autorizado", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("No tienes permisos para realizar esta acción", 403)
      );
    }

    next();
  };
};

// Middleware para verificar permisos específicos
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("No autorizado", 401));
    }

    const userPermissions = PERMISSIONS[permission] || [];

    if (!userPermissions.includes(req.user.role)) {
      return next(
        new AppError("No tienes permisos para realizar esta acción", 403)
      );
    }

    next();
  };
};

// Definir permisos por funcionalidad
const PERMISSIONS = {
  // Expedientes
  "expedientes.create": [ROLES.JUEZ],
  "expedientes.submit": [ROLES.JUEZ],
  "expedientes.approve_audiencia": [ROLES.PRESIDENTE_AUDIENCIA],
  "expedientes.approve_final": [ROLES.SECRETARIO_GENERAL],
  "expedientes.view_all": [
    ROLES.ADMIN,
    ROLES.SECRETARIO_GENERAL,
    ROLES.PRESIDENTE_CSPJ,
  ],

  // Noticias
  "news.create": [ROLES.TECNICO_PRENSA, ROLES.DIRECTOR_PRENSA],
  "news.approve_director": [ROLES.DIRECTOR_PRENSA],
  "news.approve_president": [ROLES.PRESIDENTE_CSPJ],
  "news.publish_direct": [ROLES.DIRECTOR_PRENSA], // Solo para avisos/comunicados

  // Contacto
  "contact.view": [
    ROLES.SECRETARIO_ADJUNTO,
    ROLES.SECRETARIO_GENERAL,
    ROLES.PRESIDENTE_CSPJ,
    ROLES.VICEPRESIDENTE_CSPJ,
  ],
  "contact.assign": [ROLES.SECRETARIO_ADJUNTO],

  // Usuarios
  "users.manage": [ROLES.ADMIN],
  "users.view": [ROLES.ADMIN, ROLES.SECRETARIO_GENERAL],

  // Auditoría
  "audit.view": [ROLES.ADMIN, ROLES.SECRETARIO_GENERAL, ROLES.PRESIDENTE_CSPJ],

  // Departamentos
  "departments.manage": [ROLES.ADMIN, ROLES.PRESIDENTE_CSPJ],
  "departments.view_stats": [
    ROLES.ADMIN,
    ROLES.PRESIDENTE_CSPJ,
    ROLES.SECRETARIO_GENERAL,
  ],
};

// Middleware para verificar si es el propietario del recurso o tiene rol específico
export const requireOwnershipOrRole = (
  ownerField = "createdBy",
  roles = []
) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("No autorizado", 401));
    }

    // Si tiene uno de los roles permitidos, puede continuar
    if (roles.includes(req.user.role)) {
      return next();
    }

    // Verificar si es el propietario (se verificará en el controlador)
    req.checkOwnership = {
      field: ownerField,
      userId: req.user.id,
    };

    next();
  };
};

// Middleware para verificar departamento
export const requireSameDepartment = () => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("No autorizado", 401));
    }

    // Los roles superiores pueden ver todo
    const superiorRoles = [
      ROLES.ADMIN,
      ROLES.PRESIDENTE_CSPJ,
      ROLES.SECRETARIO_GENERAL,
      ROLES.SECRETARIO_ADJUNTO,
    ];

    if (superiorRoles.includes(req.user.role)) {
      return next();
    }

    // Para otros roles, verificar departamento (se verificará en el controlador)
    req.checkDepartment = true;

    next();
  };
};
