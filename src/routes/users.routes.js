import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/roleCheck.js";
import { db, users, departments } from "../db/index.js";
import { inArray, eq, and } from "drizzle-orm";
import { ROLES } from "../utils/constants.js";
import { formatResponse } from "../utils/helpers.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Ruta pública para registro de usuarios normales
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password, fullName, dni, phone } = req.body;

    if (!email || !password || !fullName || !dni) {
      return res.status(400).json(formatResponse(null, "Campos requeridos: email, password, fullName, dni", false));
    }

    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length) {
      return res.status(400).json(formatResponse(null, "El email ya está en uso", false));
    }

    const existingDni = await db.select().from(users).where(eq(users.dni, dni)).limit(1);
    if (existingDni.length) {
      return res.status(400).json(formatResponse(null, "El DNI ya está en uso", false));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    const newUser = await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      fullName,
      dni,
      phone: phone || null,
      role: ROLES.CIUDADANO,
      departmentId: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      dni: users.dni,
      phone: users.phone,
      role: users.role,
    });

    res.status(201).json(formatResponse(newUser[0], "Usuario registrado exitosamente"));
  })
);

router.use(authenticate);

// Obtener todos los usuarios
router.get(
  "/",
  requirePermission("user.view"),
  asyncHandler(async (req, res) => {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        dni: users.dni,
        phone: users.phone,
        role: users.role,
        departmentId: users.departmentId,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id));

    res.json(formatResponse(allUsers, "Usuarios obtenidos"));
  })
);

// Obtener usuario por ID
router.get(
  "/:id",
  requirePermission("user.view"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        dni: users.dni,
        phone: users.phone,
        role: users.role,
        departmentId: users.departmentId,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user.length) {
      return res.status(404).json(formatResponse(null, "Usuario no encontrado", false));
    }

    res.json(formatResponse(user[0], "Usuario obtenido"));
  })
);

// Crear nuevo usuario (solo admins)
router.post(
  "/",
  requirePermission("user.create"),
  asyncHandler(async (req, res) => {
    const { email, password, fullName, dni, phone, role, departmentId } = req.body;

    if (!email || !password || !fullName || !dni || !role) {
      return res.status(400).json(formatResponse(null, "Campos requeridos: email, password, fullName, dni, role", false));
    }

    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length) {
      return res.status(400).json(formatResponse(null, "El email ya está en uso", false));
    }

    const existingDni = await db.select().from(users).where(eq(users.dni, dni)).limit(1);
    if (existingDni.length) {
      return res.status(400).json(formatResponse(null, "El DNI ya está en uso", false));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    const newUser = await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      fullName,
      dni,
      phone: phone || null,
      role,
      departmentId: departmentId || null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      dni: users.dni,
      phone: users.phone,
      role: users.role,
      departmentId: users.departmentId,
      isActive: users.isActive,
    });

    res.status(201).json(formatResponse(newUser[0], "Usuario creado exitosamente"));
  })
);

// Actualizar usuario
router.put(
  "/:id",
  requirePermission("user.update"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { email, fullName, dni, phone, role, departmentId, isActive } = req.body;

    const existingUser = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existingUser.length) {
      return res.status(404).json(formatResponse(null, "Usuario no encontrado", false));
    }

    if (email && email !== existingUser[0].email) {
      const emailExists = await db.select().from(users).where(and(eq(users.email, email), eq(users.id, id, false))).limit(1);
      if (emailExists.length) {
        return res.status(400).json(formatResponse(null, "El email ya está en uso", false));
      }
    }

    if (dni && dni !== existingUser[0].dni) {
      const dniExists = await db.select().from(users).where(and(eq(users.dni, dni), eq(users.id, id, false))).limit(1);
      if (dniExists.length) {
        return res.status(400).json(formatResponse(null, "El DNI ya está en uso", false));
      }
    }

    const updateData = {};
    if (email !== undefined) updateData.email = email;
    if (fullName !== undefined) updateData.fullName = fullName;
    if (dni !== undefined) updateData.dni = dni;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (isActive !== undefined) updateData.isActive = isActive;
    updateData.updatedAt = new Date().toISOString();

    const updatedUser = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        dni: users.dni,
        phone: users.phone,
        role: users.role,
        departmentId: users.departmentId,
        isActive: users.isActive,
        updatedAt: users.updatedAt,
      });

    res.json(formatResponse(updatedUser[0], "Usuario actualizado exitosamente"));
  })
);

// Eliminar usuario (desactivar)
router.delete(
  "/:id",
  requirePermission("user.delete"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingUser = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existingUser.length) {
      return res.status(404).json(formatResponse(null, "Usuario no encontrado", false));
    }

    const updatedUser = await db.update(users)
      .set({ 
        isActive: false,
        updatedAt: new Date().toISOString()
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        isActive: users.isActive,
      });

    res.json(formatResponse(updatedUser[0], "Usuario desactivado exitosamente"));
  })
);

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
