import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const news = sqliteTable("news", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"), // NUEVO
  slug: text("slug").unique().notNull(), // NUEVO
  content: text("content").notNull(),
  status: text("status").notNull(),
  type: text("type").notNull(),
  imageUrl: text("image_url"), // NUEVO
  imagePublicId: text("image_public_id"), // NUEVO
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  approvedByDirector: text("approved_by_director").references(() => users.id),
  approvedByPresident: text("approved_by_president").references(() => users.id),
  publishedAt: text("published_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
