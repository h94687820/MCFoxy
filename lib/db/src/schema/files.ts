import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const filesTable = pgTable("files", {
  id: serial("id").primaryKey(),
  customId: text("custom_id").unique(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  title: text("title"), // human-entered mod/map name, shown in UI instead of the raw filename
  edition: text("edition").notNull().default("java"), // "java" | "bedrock"
  type: text("type").notNull(), // "mod" | "map"
  size: integer("size").notNull(),
  mimeType: text("mime_type"),
  filePath: text("file_path").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  scanStatus: text("scan_status").notNull().default("pending"), // pending | scanning | clean | malicious | error | skipped
  scanDetails: text("scan_details"),
  scanEngine: text("scan_engine"),
  virusTotalLink: text("virus_total_link"),
  detectionRatio: text("detection_ratio"),
  description: text("description"),
  coverImage: text("cover_image"), // primary/cover image filename, distinct from the `images` screenshot gallery
  images: jsonb("images").$type<string[]>().default([]),
  uploadedBy: text("uploaded_by"),
});

export const insertFileSchema = createInsertSchema(filesTable).omit({ id: true, uploadedAt: true });
export type InsertFile = z.infer<typeof insertFileSchema>;
export type UploadedFile = typeof filesTable.$inferSelect;
