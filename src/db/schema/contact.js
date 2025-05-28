import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const citizenContacts = sqliteTable("citizen_contacts", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  dni: text("dni").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  attachmentUrl: text("attachment_url"),
  status: text("status").default("pending"), // 'pending', 'in_progress', 'resolved'
  assignedTo: text("assigned_to").references(() => users.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  baseFee: integer("base_fee").notNull(),
  renewalFee: integer("renewal_fee"),
  minAmount: integer("min_amount"),
  maxAmount: integer("max_amount"),
  percentageFee: real("percentage_fee"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
