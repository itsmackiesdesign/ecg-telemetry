# PulsePoint

Mobile-first emergency cardiac assessment prototype, built with React, TypeScript, Vinext, Tailwind CSS and shadcn/ui.

## Run

Requires Node.js 22.13+ (tested with Node.js 24).

- `npm run install:ci`
- `npm run dev`
- `npm run build`
- `npx tsc --noEmit`

## Implemented

- Responsive four-stage assessment: patient presentation, ECG image, clinician-driven assessment, routing handover.
- English, Uzbek Cyrillic and Russian interface.
- Validated adult vital-sign inputs and symptom selection.
- Local ECG image upload/camera input; explicitly synthetic sample ECG.
- Conservative red/yellow/green triage from clinician-entered findings and vital signs; normal ECG does not exclude ACS.
- Care checklist, clinician cautions, location permission, session timeline and JSON handover export.
- App-shell service worker; core client-side guidance can run offline after assets have been cached. Patient inputs stay in memory and are lost on reload. No patient data is sent to a server or stored in browser persistence.
- Optional browser WebMCP read-only workflow status tool.

## Clinical limits

This is not a validated medical device or diagnostic AI. It does not interpret uploaded ECG images, verify recording quality, determine a new block from prior ECGs, perform live routing, contact clinicians, or alert hospitals. Those integrations are explicitly marked as disconnected. Adult-only input constraints; no paediatric guidance.

Illustrative aspirin and oxygen guidance is based on the 2025 ACC/AHA ACS guideline; the guidance screen links to that guideline and the 2023 ESC ACS guideline. No claim is made that the prototype conforms to Uzbekistan national protocols. Local protocol reconciliation, independent cardiology review, ECG dataset validation, privacy/security controls, clinical integration agreements and regulatory assessment are prerequisites for real clinical use.

Green means no signs were entered, not ACS exclusion. Poor-quality ECG and new conduction abnormalities cannot produce green. Uploads never create an AI-generated result. Reperfusion timing remains unrecorded until an actual reperfusion event; receipt of an image is not claimed as actual ECG acquisition time.
