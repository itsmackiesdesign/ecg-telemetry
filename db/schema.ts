import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const centers = sqliteTable("centers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  emergencyPhone: text("emergency_phone").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  pciAvailable: integer("pci_available", { mode: "boolean" }).notNull().default(false),
  acceptingPatients: integer("accepting_patients", { mode: "boolean" }).notNull().default(false),
  managerUserId: text("manager_user_id").notNull(),
  managerEmail: text("manager_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const handovers = sqliteTable("center_handovers", {
  id: text("id").primaryKey(),
  centerId: text("center_id").notNull().references(() => centers.id),
  clinicianUserId: text("clinician_user_id").notNull(),
  clinicianEmail: text("clinician_email").notNull(),
  patientJson: text("patient_json").notNull(),
  ecgObjectKey: text("ecg_object_key").notNull(),
  ecgContentType: text("ecg_content_type").notNull(),
  ecgBytes: integer("ecg_bytes").notNull(),
  status: text("status", { enum: ["new", "acknowledged", "closed"] }).notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  acknowledgedAt: text("acknowledged_at"),
});
