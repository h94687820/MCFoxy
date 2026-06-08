import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const filesTable = pgTable("files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  edition: text("edition").notNull().default("java"), // "java" | "bedrock"
  type: text("type").notNull(), // "mod" | "map"
  size: integer("size").notNull(),
  mimeType: text("mime_type"),
  filePath: text("file_path").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  scanStatus: text("scan_status").notNull().default("pending"), // pending | scanning | clean | malicious | error
  scanDetails: text("scan_details"),
  scanEngine: text("scan_engine"),
  virusTotalLink: text("virus_total_link"),
  detectionRatio: text("detection_ratio"),
  description: text("description"),
  images: jsonb("images").$type<string[]>().default([]),
});

export const insertFileSchema = createInsertSchema(filesTable).omit({ id: true, uploadedAt: true });
export type InsertFile = z.infer<typeof insertFileSchema>;
export type UploadedFile = typeof filesTable.$inferSelect;
