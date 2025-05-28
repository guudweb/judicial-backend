import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { expedientes } from "./expedientes.js";
import { users } from "./users.js";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  expedienteId: text("expediente_id").references(() => expedientes.id),
  filename: text("filename").notNull(),
  cloudinaryUrl: text("cloudinary_url").notNull(),
  cloudinaryPublicId: text("cloudinary_public_id").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
