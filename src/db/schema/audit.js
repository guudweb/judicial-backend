// src/db/schema/audit.js (ACTUALIZADO)
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  oldValues: text("old_values"), // JSON
  newValues: text("new_values"), // JSON
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(), // expediente_assigned, news_rejected, etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").default("unread"), // 'unread', 'read', 'deleted'
  entityType: text("entity_type"), // expediente, news, contact
  entityId: text("entity_id"),
  metadata: text("metadata"), // JSON con datos adicionales
  readAt: text("read_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
