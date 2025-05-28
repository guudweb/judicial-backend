import authService from "../services/auth.service.js";
import { formatResponse } from "../utils/helpers.js";

export const register = async (req, res) => {
  const user = await authService.register(req.body);
  res.status(201).json(formatResponse(user, "Usuario registrado exitosamente"));
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);

  res.json(formatResponse(result, "Inicio de sesión exitoso"));
};

export const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: "Refresh token requerido",
    });
  }

  const result = await authService.refreshAccessToken(refreshToken);
  res.json(formatResponse(result, "Token actualizado"));
};

export const logout = async (req, res) => {
  const { refreshToken } = req.body;
  await authService.logout(req.user.id, refreshToken);

  res.json(formatResponse(null, "Sesión cerrada exitosamente"));
};

export const getProfile = async (req, res) => {
  const profile = await authService.getProfile(req.user.id);
  res.json(formatResponse(profile, "Perfil obtenido"));
};

export const updateProfile = async (req, res) => {
  const profile = await authService.updateProfile(req.user.id, req.body);
  res.json(formatResponse(profile, "Perfil actualizado"));
};

export const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, oldPassword, newPassword);

  res.json(formatResponse(null, "Contraseña actualizada exitosamente"));
};
