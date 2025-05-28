import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, users, refreshTokens, blacklistedTokens } from "../db/index.js";
import { eq, and, gt } from "drizzle-orm";
import { generateId } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import logger from "../utils/logger.js";

class AuthService {
  async register(userData) {
    const { email, password, fullName, dni, phone, role, departmentId } =
      userData;

    // Verificar si el usuario ya existe
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new AppError("El email ya está registrado", 409);
    }

    // Verificar DNI único
    const existingDni = await db
      .select()
      .from(users)
      .where(eq(users.dni, dni))
      .limit(1);

    if (existingDni.length > 0) {
      throw new AppError("El DNI ya está registrado", 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Crear usuario
    const userId = generateId("usr");
    const newUser = {
      id: userId,
      email,
      passwordHash,
      fullName,
      dni,
      phone,
      role,
      departmentId,
      isActive: true,
    };

    await db.insert(users).values(newUser);

    logger.info("Usuario registrado", { userId, email, role });

    // Retornar usuario sin password
    const { passwordHash: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }

  async login(email, password) {
    // Buscar usuario
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user.length === 0) {
      throw new AppError("Credenciales inválidas", 401);
    }

    const foundUser = user[0];

    // Verificar si está activo
    if (!foundUser.isActive) {
      throw new AppError("Usuario desactivado", 401);
    }

    // Verificar password
    const isPasswordValid = await bcrypt.compare(
      password,
      foundUser.passwordHash
    );
    if (!isPasswordValid) {
      throw new AppError("Credenciales inválidas", 401);
    }

    // Generar tokens
    const accessToken = this.generateAccessToken(foundUser);
    const refreshToken = await this.generateRefreshToken(foundUser);

    logger.info("Usuario autenticado", { userId: foundUser.id, email });

    // Retornar usuario sin password
    const { passwordHash, ...userWithoutPassword } = foundUser;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  }

  async refreshAccessToken(token) {
    // Verificar si el token está en blacklist
    const blacklisted = await db
      .select()
      .from(blacklistedTokens)
      .where(eq(blacklistedTokens.token, token))
      .limit(1);

    if (blacklisted.length > 0) {
      throw new AppError("Token inválido", 401);
    }

    // Buscar refresh token
    const storedToken = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token, token),
          gt(refreshTokens.expiresAt, new Date().toISOString())
        )
      )
      .limit(1);

    if (storedToken.length === 0) {
      throw new AppError("Token inválido o expirado", 401);
    }

    // Verificar JWT
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

      // Buscar usuario
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, decoded.sub))
        .limit(1);

      if (user.length === 0 || !user[0].isActive) {
        throw new AppError("Usuario no encontrado o inactivo", 401);
      }

      // Generar nuevo access token
      const accessToken = this.generateAccessToken(user[0]);

      return { accessToken };
    } catch (error) {
      throw new AppError("Token inválido", 401);
    }
  }

  async logout(userId, refreshToken) {
    try {
      // Agregar token a blacklist
      if (refreshToken) {
        const decoded = jwt.decode(refreshToken);
        await db.insert(blacklistedTokens).values({
          id: generateId("blk"),
          token: refreshToken,
          userId,
          expiresAt: new Date(decoded.exp * 1000).toISOString(),
        });

        // Eliminar refresh token
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.token, refreshToken));
      }

      logger.info("Usuario desconectado", { userId });
      return true;
    } catch (error) {
      logger.error("Error en logout", error);
      throw new AppError("Error al cerrar sesión", 500);
    }
  }

  generateAccessToken(user) {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
    );
  }

  async generateRefreshToken(user) {
    const token = jwt.sign(
      {
        sub: user.id,
        type: "refresh",
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }
    );

    // Guardar en base de datos
    const decoded = jwt.decode(token);
    await db.insert(refreshTokens).values({
      id: generateId("rtk"),
      token,
      userId: user.id,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    });

    return token;
  }

  async getProfile(userId) {
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        dni: users.dni,
        phone: users.phone,
        role: users.role,
        departmentId: users.departmentId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      throw new AppError("Usuario no encontrado", 404);
    }

    return user[0];
  }

  async updateProfile(userId, updates) {
    const { fullName, phone } = updates;

    await db
      .update(users)
      .set({
        fullName,
        phone,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    return this.getProfile(userId);
  }

  async changePassword(userId, oldPassword, newPassword) {
    // Buscar usuario
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      throw new AppError("Usuario no encontrado", 404);
    }

    // Verificar password actual
    const isPasswordValid = await bcrypt.compare(
      oldPassword,
      user[0].passwordHash
    );
    if (!isPasswordValid) {
      throw new AppError("Contraseña actual incorrecta", 401);
    }

    // Hash nuevo password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Actualizar password
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    logger.info("Contraseña actualizada", { userId });
    return true;
  }
}

export default new AuthService();
