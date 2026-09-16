import test from "node:test";
import assert from "node:assert/strict";
import { centerInputSchema, handoverContextSchema } from "../lib/center-schemas";

test("center profile requires manager-facing contact and availability fields", () => {
  const parsed = centerInputSchema.safeParse({
    name: "Central Cardiology Center",
    city: "Tashkent",
    address: "1 Example Street",
    phone: "+998 71 000 00 00",
    emergencyPhone: "+998 90 000 00 00",
    latitude: "41.31",
    longitude: "69.28",
    pciAvailable: true,
    acceptingPatients: false,
  });
  assert.equal(parsed.success, true);
});

test("handover rejects missing consent and invalid blood pressure", () => {
  const base = {
    centerId: "center-1",
    patient: { age: 58, sex: "male", symptom_onset: null, systolic: 120, diastolic: 80, pulse: 78, spo2: 97, symptoms: ["chest"], notes: "" },
  };
  assert.equal(handoverContextSchema.safeParse(base).success, false);
  assert.equal(handoverContextSchema.safeParse({ ...base, transferConsent: true, patient: { ...base.patient, systolic: 70, diastolic: 90 } }).success, false);
});
