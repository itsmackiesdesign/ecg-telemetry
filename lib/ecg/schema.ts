import { z } from 'zod';
const texts = z.array(z.string());
export const analysisSchema = z.object({
  analysis_status: z.enum(['completed', 'limited', 'unable_to_interpret']),
  image_quality: z.object({status:z.enum(['adequate','limited','uninterpretable']),readable_leads:texts,missing_or_unreadable_leads:texts,calibration_visible:z.boolean(),limitations:texts}).strict(),
  measurements:z.array(z.object({name:z.string(),value:z.number().nullable(),unit:z.string().nullable(),source:z.enum(['visual_estimate','device_printout','supplied_data']),approximate:z.boolean(),limitation:z.string().nullable()}).strict()),
  observed_findings:z.array(z.object({finding:z.string(),leads:texts,supporting_observation:z.string()}).strict()),
  preliminary_interpretations:z.array(z.object({interpretation:z.string(),supporting_findings:texts,limitations:texts}).strict()),
  review_priority:z.enum(['emergency_review','urgent_review','no_acute_ecg_features_identified','indeterminate']),
  priority_reason:z.string(),
  next_steps:z.array(z.object({action:z.string(),reason:z.string(),urgency:z.enum(['immediate','urgent','routine'])}).strict()),
  missing_information:texts,
  summary_for_clinician:z.string(),
  requires_physician_confirmation:z.literal(true),
  acs_ruled_out:z.literal(false),
}).strict();
export type EcgAnalysis = z.infer<typeof analysisSchema>;
export type Language = 'en'|'ru'|'uz';
export type AnalysisEnvelope = {analysis:EcgAnalysis;model:string;prompt_version:string;analyzed_at:string;guardrails:string[]};
export const patientSchema=z.object({
  age:z.number().int().min(18).max(120),sex:z.enum(['male','female']),
  symptom_onset:z.string().max(80).nullable(),
  systolic:z.number().min(40).max(300),diastolic:z.number().min(20).max(200),
  pulse:z.number().min(20).max(300),spo2:z.number().min(30).max(100),
  symptoms:z.array(z.enum(['chest','breath','sweat','nausea','radiating','dizzy'])).max(6),
  notes:z.string().max(4000),
}).strict().refine(p=>p.diastolic<=p.systolic,{message:'Invalid blood pressure'});
export const contextSchema=z.object({language:z.enum(['en','ru','uz']),patient:patientSchema,consent:z.literal(true)}).strict();
export type ClinicalContext=z.infer<typeof contextSchema>;

// Generate the API schema from the same validator used for incoming model output.
export function jsonSchema(schema:z.ZodTypeAny):Record<string,unknown>{
  if(schema instanceof z.ZodObject){const properties=Object.fromEntries(Object.entries(schema.shape).map(([key,value])=>[key,jsonSchema(value as z.ZodTypeAny)]));return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};}
  if(schema instanceof z.ZodArray)return {type:'array',items:jsonSchema(schema.element)};
  if(schema instanceof z.ZodNullable)return {anyOf:[jsonSchema(schema.unwrap()),{type:'null'}]};
  if(schema instanceof z.ZodEnum)return {type:'string',enum:schema.options};
  if(schema instanceof z.ZodLiteral)return {type:typeof schema.value,enum:[schema.value]};
  if(schema instanceof z.ZodString)return {type:'string'};
  if(schema instanceof z.ZodNumber)return {type:'number'};
  if(schema instanceof z.ZodBoolean)return {type:'boolean'};
  throw new Error('Unsupported structured output schema');
}
export function applyGuardrails(input:EcgAnalysis,patient:ClinicalContext['patient']):{analysis:EcgAnalysis;guardrails:string[]}{
  const analysis=structuredClone(input);const guardrails:string[]=[];
  const unstable=patient.systolic<90||patient.spo2<90||patient.pulse<40||patient.pulse>150;
  if(analysis.image_quality.status==='uninterpretable'||analysis.analysis_status==='unable_to_interpret'){
    analysis.image_quality.status='uninterpretable';analysis.analysis_status='unable_to_interpret';
    if(!['emergency_review','urgent_review'].includes(analysis.review_priority)){analysis.review_priority='indeterminate';guardrails.push('uninterpretable');}
  }else if(analysis.image_quality.status==='limited'||analysis.analysis_status==='limited'){
    analysis.analysis_status='limited';
    if(analysis.review_priority==='no_acute_ecg_features_identified'){analysis.review_priority='indeterminate';guardrails.push('limited');}
  }
  const expected=['i','ii','iii','avr','avl','avf','v1','v2','v3','v4','v5','v6'];
  const leads=new Set(analysis.image_quality.readable_leads.map(x=>x.trim().toLowerCase()));
  if(analysis.review_priority==='no_acute_ecg_features_identified'&&(!expected.every(x=>leads.has(x))||analysis.image_quality.missing_or_unreadable_leads.length||!analysis.image_quality.calibration_visible)){
    analysis.review_priority='indeterminate';guardrails.push('incomplete_recording');
  }
  if(!analysis.image_quality.calibration_visible){
    for(const m of analysis.measurements)if(m.source==='visual_estimate'&&m.value!==null){m.value=null;guardrails.push('unverified_measurement');}
  }
  if(patient.symptoms.length&&analysis.review_priority==='no_acute_ecg_features_identified'){
    analysis.review_priority='urgent_review';guardrails.push('symptoms_require_review');
  }
  if(unstable&&analysis.review_priority!=='emergency_review'){
    analysis.review_priority='emergency_review';guardrails.push('abnormal_vitals');
  }
  return {analysis,guardrails:[...new Set(guardrails)]};
}
