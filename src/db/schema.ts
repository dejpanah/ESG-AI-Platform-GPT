import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const reports = pgTable("reports", {
  id: varchar("id", { length: 128 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 128 }).notNull(),
  userId: varchar("user_id", { length: 128 }),
  title: text("title").notNull(),
  reportType: varchar("report_type", { length: 64 }).notNull(),
  body: text("body").notNull(),
  format: varchar("format", { length: 32 }).notNull().default("markdown"),
  model: varchar("model", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("completed"),
  version: integer("version").notNull().default(1),
  sources: jsonb("sources").notNull().default([]),
  citations: jsonb("citations").notNull().default([]),
  traceId: varchar("trace_id", { length: 128 }),
  metadata: jsonb("metadata").notNull().default({}),
  versions: jsonb("versions").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReportRecord = typeof reports.$inferSelect;
export type NewReportRecord = typeof reports.$inferInsert;
