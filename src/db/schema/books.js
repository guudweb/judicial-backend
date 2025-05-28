import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  author: text("author").notNull(),
  tags: text("tags"), // JSON array de strings
  type: text("type").notNull(), // 'tratado', 'manual', 'codigo_legal', 'libro'
  coverImageUrl: text("cover_image_url"),
  coverImagePublicId: text("cover_image_public_id"),
  fileUrl: text("file_url").notNull(),
  filePublicId: text("file_public_id").notNull(),
  fileSize: integer("file_size"),
  fileType: text("file_type"), // PDF, EPUB, etc.
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  viewCount: integer("view_count").default(0),
  downloadCount: integer("download_count").default(0),
  isPublic: integer("is_public", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
