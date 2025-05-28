import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import passport from "./config/passport.js";

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

const app = express();

// Middleware de seguridad
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:8080",
    credentials: true,
  })
);

// Comprimir respuestas
app.use(compression());

// Logger HTTP
app.use(morgan("combined"));

// Parser de JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Inicializar Passport
app.use(passport.initialize());

// Health check
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

// Manejo de errores
app.use(notFound);
app.use(errorHandler);

export default app;
