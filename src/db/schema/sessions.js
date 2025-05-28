import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id").primaryKey(),
  token: text("token").unique().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const blacklistedTokens = sqliteTable("blacklisted_tokens", {
  id: text("id").primaryKey(),
  token: text("token").unique().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  blacklistedAt: text("blacklisted_at").default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
});
