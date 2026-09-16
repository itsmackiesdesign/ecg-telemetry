import { z } from "zod";

export const centerInputSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(3).max(240),
  phone: z.string().trim().min(5).max(40),
  emergencyPhone: z.string().trim().min(5).max(40),
  latitude: z.string().trim().max(32).optional().or(z.literal("")),
  longitude: z.string().trim().max(32).optional().or(z.literal("")),
  pciAvailable: z.boolean(),
  acceptingPatients: z.boolean().optional().default(false),
  availabilityStatus: z.enum(["accepting", "limited", "unavailable"]).optional().default("unavailable"),
}).strict();

export const handoverContextSchema = z.object({
  centerId: z.string().min(1).max(80),
  transferConsent: z.literal(true),
  patientId: z.string().trim().max(80).optional(),
  patient: z.object({
    age: z.number().int().min(18).max(120),
    sex: z.enum(["male", "female"]),
    symptom_onset: z.string().max(80).nullable(),
    systolic: z.number().min(40).max(300),
    diastolic: z.number().min(20).max(200),
    pulse: z.number().min(20).max(300),
    spo2: z.number().min(30).max(100),
    symptoms: z.array(z.enum(["chest", "breath", "sweat", "nausea", "radiating", "dizzy"])).max(6),
    notes: z.string().max(4000),
  }).strict().refine((p) => p.diastolic <= p.systolic, "Invalid blood pressure"),
  clinicianFinding: z.string().max(120).optional(),
  gptSummary: z.string().max(4000).optional(),
  gptPriority: z.string().max(60).optional(),
  analysisId: z.string().max(120).optional(),
}).strict();

export type CenterInput = z.infer<typeof centerInputSchema>;
export type HandoverContext = z.infer<typeof handoverContextSchema>;
