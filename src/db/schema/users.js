import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  parentId: text("parent_id"),
  location: text("location"), // NUEVO: Jurisdicción
  orderIndex: integer("order_index").default(0), // NUEVO: Para ordenamiento
  metadata: text("metadata"), // NUEVO: JSON con info adicional
  isActive: integer("is_active", { mode: "boolean" }).default(true), // NUEVO
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at"), // SIN DEFAULT para evitar el error
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  dni: text("dni").unique().notNull(),
  phone: text("phone"),
  role: text("role").notNull(),
  departmentId: text("department_id").references(() => departments.id),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
