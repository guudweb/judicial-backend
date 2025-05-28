import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../utils/validators.js";
import { audit, auditHelpers } from "../middleware/audit.js";
import { registerSchema, loginSchema } from "../utils/validators.js";
import { z } from "zod";
import {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Rutas públicas con auditoría
router.post(
  "/register",
  validate(registerSchema),
  audit("auth.register", auditHelpers.user),
  asyncHandler(register)
);

router.post(
  "/login",
  validate(loginSchema),
  audit("auth.login"),
  asyncHandler(login)
);

router.post("/refresh", asyncHandler(refreshToken));

// Rutas protegidas
router.use(authenticate);

router.post("/logout", audit("auth.logout"), asyncHandler(logout));

router.get("/profile", asyncHandler(getProfile));

router.put(
  "/profile",
  validate(
    z.object({
      fullName: z.string().min(3).optional(),
      phone: z.string().optional(),
    })
  ),
  asyncHandler(updateProfile)
);

router.put(
  "/change-password",
  validate(
    z.object({
      oldPassword: z.string().min(1),
      newPassword: z.string().min(6),
    })
  ),
  audit("auth.password_change"),
  asyncHandler(changePassword)
);

export default router;
