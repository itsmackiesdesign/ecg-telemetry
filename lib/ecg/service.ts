import {analysisSchema,applyGuardrails,jsonSchema,type ClinicalContext} from './schema';
import {ECG_SYSTEM_PROMPT,PROMPT_VERSION} from './prompt';
export class AnalysisError extends Error{constructor(public code:string,public status=502){super(code)}}
export const MAX_IMAGE_BYTES=5*1024*1024;
export function imageMime(bytes:Uint8Array):string|null{
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
  if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
export async function analyzeEcg({bytes,mime,context,key,model,signal,fetcher=fetch}:{bytes:Uint8Array;mime:string;context:ClinicalContext;key:string;model:string;signal?:AbortSignal;fetcher?:typeof fetch}){
  const timeout=new AbortController();const timer=setTimeout(()=>timeout.abort(),90000);
  const combined=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal;
  try{
    const response=await fetcher('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:combined,
      body:JSON.stringify({model,store:false,instructions:ECG_SYSTEM_PROMPT,max_output_tokens:6000,
        input:[{role:'user',content:[
          {type:'input_text',text:JSON.stringify({language:context.language==='uz'?'uz-Cyrl':context.language,patient:context.patient,approved_protocol:null,prior_ecg:null})},
          {type:'input_image',image_url:`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,detail:'high'}]}],
        text:{format:{type:'json_schema',name:'ecg_assessment',strict:true,schema:jsonSchema(analysisSchema)}}})
    });
    if(!response.ok){await response.body?.cancel();throw new AnalysisError(response.status===429?'rate_limited':response.status===401||response.status===403?'provider_configuration':'provider_unavailable',response.status===429?429:502)}
    const body=await response.json() as {status?:string;output?:Array<{type:string;content?:Array<{type:string;text?:string}>}>;model?:string};
    if(body.status!=='completed')throw new AnalysisError('incomplete_response');
    const contents=(body.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]);
    if(contents.some(x=>x.type==='refusal'))throw new AnalysisError('model_refusal',422);
    const text=contents.filter(x=>x.type==='output_text').map(x=>x.text||'').join('');
    let parsed:unknown;try{parsed=JSON.parse(text)}catch{throw new AnalysisError('invalid_response')}
    const validated=analysisSchema.safeParse(parsed);if(!validated.success)throw new AnalysisError('invalid_response');
    const result=applyGuardrails(validated.data,context.patient);
    return {...result,model:body.model||model,prompt_version:PROMPT_VERSION,analyzed_at:new Date().toISOString()};
  }catch(error){
    if(error instanceof AnalysisError)throw error;
    if(combined.aborted)throw new AnalysisError(signal?.aborted?'cancelled':'timeout',signal?.aborted?499:504);
    throw new AnalysisError('provider_unavailable');
  }finally{clearTimeout(timer)}
}
