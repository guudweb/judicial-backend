import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, departments } from "./users.js";

export const expedientes = sqliteTable("expedientes", {
  id: text("id").primaryKey(),
  caseNumber: text("case_number").unique().notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(), // 'draft', 'pending_approval', 'approved', 'rejected'
  currentLevel: text("current_level").notNull(), // 'juez', 'presidente_audiencia', 'secretario_general'
  departmentId: text("department_id")
    .notNull()
    .references(() => departments.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  assignedTo: text("assigned_to").references(() => users.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const approvalFlow = sqliteTable("approval_flow", {
  id: text("id").primaryKey(),
  expedienteId: text("expediente_id")
    .notNull()
    .references(() => expedientes.id),
  fromUserId: text("from_user_id")
    .notNull()
    .references(() => users.id),
  toUserId: text("to_user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(), // 'submit', 'approve', 'reject', 'return_for_revision'
  comments: text("comments"),
  fromLevel: text("from_level").notNull(),
  toLevel: text("to_level").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
