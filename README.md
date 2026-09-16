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
- App-shell service worker; core client-side guidance can run offline after assets have been cached. Patient inputs stay in memory and are lost on reload. GPT analysis sends the selected image and clinical context to OpenAI only after explicit consent; patient data is not stored in browser persistence.
- Optional browser WebMCP read-only workflow status tool.

## Clinical limits

This is not a validated medical device or diagnostic AI. With a configured server key, GPT provides preliminary image interpretation and quality observations for physician review. Comparison with prior ECGs, live routing, clinician messaging and hospital alerts remain unconnected. Adult-only input constraints; no paediatric guidance.

Illustrative aspirin and oxygen guidance is based on the 2025 ACC/AHA ACS guideline; the guidance screen links to that guideline and the 2023 ESC ACS guideline. No claim is made that the prototype conforms to Uzbekistan national protocols. Local protocol reconciliation, independent cardiology review, ECG dataset validation, privacy/security controls, clinical integration agreements and regulatory assessment are prerequisites for real clinical use.

Green means no signs were entered, not ACS exclusion. Poor-quality ECG and new conduction abnormalities cannot produce green. Uploads alone never trigger AI analysis; a separate consented request is required. Reperfusion timing remains unrecorded until an actual reperfusion event; receipt of an image is not claimed as actual ECG acquisition time.

## GPT ECG analysis (research workflow)

The ECG upload step now supports an explicit, opt-in server request to OpenAI's Responses API. The server uses the versioned prompt in `lib/ecg/prompt.ts`, image input with high detail, a strict JSON schema and runtime validation. The default model is `gpt-5.4`; `OPENAI_MODEL` can select another compatible vision + Structured Outputs model available to your project. A clinician must review every response. This is not clinical validation.

### Configuration

- Local Worker preview: copy `.dev.vars.example` to `.dev.vars` and supply `OPENAI_API_KEY` there. Restart the preview. `.dev.vars` is ignored by Git. Use the local “Sign in” link for the bundled Sites mock identity.
- Hosted Site: configure `OPENAI_API_KEY` as a secret in Sites runtime environment variables; set optional `OPENAI_MODEL` there and redeploy the saved version to apply the environment revision.
- `.env.example` documents the same server variables for other compatible runtime setups. Cloudflare Worker preview reads `.dev.vars`.
- Never use `NEXT_PUBLIC_` / `VITE_` key names or put API credentials in client code, the prompt, source control or the hosting manifest.
- Until the key is configured, `/api/ecg/status` reports unavailable and the app never substitutes a sample or normal result.

### Data and access

`POST /api/ecg/analyze` requires a same-origin request and authenticated Sites identity. The private Site audience remains unchanged. It accepts a bounded multipart request, a JPEG/PNG/WebP file with matching file signature, validated adult patient data and explicit consent. Patient ID and original file name are excluded from the model request. Notes and image pixels can still contain identifying information: remove those before submission. No D1/R2 or patient logging is added. The provider request uses `store: false`; this does not imply zero provider retention. Review OpenAI data controls and applicable clinical privacy obligations before using patient data.

No approved medication protocol or previous ECG is supplied in this version. The system prompt prohibits individualized doses without that protocol. GPT findings and suggestions are displayed separately from clinician-entered findings; they are not automatically accepted as a diagnosis. Routing remains an unconnected planning screen.

Invalid/refused/incomplete responses, provider errors, cancellation, offline mode and timeout show no assessment. Abnormal vitals cannot be downgraded by GPT output; symptoms, unreadable recordings, incomplete lead coverage and unverified calibration prevent a reassuring status. The application displays these deterministic overrides separately. This is a conservative safeguard, not a validated clinical triage algorithm. There is no autonomous messaging, prescription or transfer.

The endpoint enforces a 90-second provider deadline and a per-isolate concurrent-request guard. This is not a distributed production rate limiter; add infrastructure-level limits before wider deployment. Client changes cancel pending requests and clear stale results. Responses remain only in the active browser session unless the clinician downloads the handover.

### Verification

`node --import tsx --test tests/ecg.test.ts` exercises request construction with a mocked provider, JSON validation, refusal/error handling, cancellation and priority safeguards. Live model accuracy is not measured by these tests. A real API call and clinical dataset validation require a configured key and separately authorized validation data.
