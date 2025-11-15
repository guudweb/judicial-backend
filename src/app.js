import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import passport from "./config/passport.js";
import cookieParser from "cookie-parser";

import { generalLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

// Importar rutas
import authRoutes from "./routes/auth.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import expedientesRoutes from "./routes/expedientes.routes.js";
import documentsRoutes from "./routes/documents.routes.js";
import newsRoutes from "./routes/news.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import userRoutes from "./routes/users.routes.js";
import booksRoutes from "./routes/books.routes.js";
import departmentsRoutes from "./routes/departments.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

const app = express();

// Middleware de seguridad
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Para compatibilidad con Cloudinary
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    frameguard: { action: "deny" },
    xssFilter: true,
  })
);

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://judicial.gq",
  "https://www.judicial.gq",
  "https://justicia-dashboard.vercel.app",
  "https://poder-judicial-sable.vercel.app",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:4000", "http://localhost:3000"]
    : []),
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir requests sin origin (como apps móviles)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("No permitido por CORS"));
      }
    },
    credentials: true,
  })
);

//RATE LIMITING GENERAL AQUÍ:
app.use(generalLimiter);

// Comprimir respuestas
app.use(compression());

// Logger HTTP
app.use(morgan("combined"));

// Parser de cookies
app.use(cookieParser());

// Parser de JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Inicializar Passport
app.use(passport.initialize());

// Health check (sin rate limiting)
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Rutas principales
app.get("/", (req, res) => {
  res.json({
    message: "API del Sistema Judicial",
    version: "1.0.0",
  });
});

// Rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/expedientes", expedientesRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/users", userRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Manejo de errores generales
app.use(notFound);
app.use(errorHandler);

export default app;
