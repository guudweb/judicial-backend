import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/roleCheck.js";
import { db, users } from "../db/index.js";
import { inArray } from "drizzle-orm";
import { ROLES } from "../utils/constants.js";
import { formatResponse } from "../utils/helpers.js";

const router = express.Router();

router.use(authenticate);

// Obtener usuarios que pueden gestionar mensajes
router.get(
  "/assignable",
  requirePermission("contact.view"),
  asyncHandler(async (req, res) => {
    const assignableRoles = [
      ROLES.SECRETARIO_ADJUNTO,
      ROLES.SECRETARIO_GENERAL,
      ROLES.PRESIDENTE_CSPJ,
      ROLES.VICEPRESIDENTE_CSPJ,
    ];

    const assignableUsers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(inArray(users.role, assignableRoles));

    res.json(formatResponse(assignableUsers, "Usuarios obtenidos"));
  })
);

export default router;
