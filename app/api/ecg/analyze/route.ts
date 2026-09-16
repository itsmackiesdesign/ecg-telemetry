import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getAppUser} from '@/lib/app-auth';
import {contextSchema} from '@/lib/ecg/schema';
import {analyzeEcg,AnalysisError,imageMime,MAX_IMAGE_BYTES} from '@/lib/ecg/service';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const running=new Set<string>();
export async function POST(request:Request){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'forbidden_origin'},403);
  // Never derive access or API credentials from client fields.
  const appUser=await getAppUser(); const platformUser=appUser?null:await getChatGPTUser(); const userId=appUser?.id||platformUser?.userId; if(!userId)return reply({error:'sign_in_required'},401);
  const bindings=env as {OPENAI_API_KEY?:string;OPENAI_MODEL?:string};
  const key=bindings.OPENAI_API_KEY?.trim();if(!key)return reply({error:'not_configured'},503);
  if(running.has(userId))return reply({error:'request_in_progress'},429);
  if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data'))return reply({error:'invalid_input'},400);
  const length=Number(request.headers.get('Content-Length'));
  if(length>MAX_IMAGE_BYTES+65536)return reply({error:'file_too_large'},413);
  running.add(userId);
  try{
    // Bound the stream before formData allocation, including chunked uploads.
    const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_input'},400);
    const chunks:Uint8Array[]=[];let total=0;
    while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_IMAGE_BYTES+65536){await reader.cancel();return reply({error:'file_too_large'},413)}chunks.push(value)}
    const body=new Uint8Array(total);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
    const form=await new Response(body,{headers:{'Content-Type':request.headers.get('Content-Type')!}}).formData();
    const file=form.get('image');if(!file||typeof file==='string'||!file.size)return reply({error:'invalid_image'},400);
    if(file.size>MAX_IMAGE_BYTES)return reply({error:'file_too_large'},413);
    let raw:unknown;try{raw=JSON.parse(String(form.get('context')))}catch{return reply({error:'invalid_input'},400)}
    const context=contextSchema.safeParse(raw);if(!context.success)return reply({error:'invalid_input'},400);
    const bytes=new Uint8Array(await file.arrayBuffer());const mime=imageMime(bytes);
    if(!mime||file.type!==mime)return reply({error:'invalid_image'},400);
    const result=await analyzeEcg({bytes,mime,context:context.data,key,model:bindings.OPENAI_MODEL||'gpt-5.4',signal:request.signal});
    return reply(result);
  }catch(error){if(error instanceof AnalysisError)return reply({error:error.code},error.status);return reply({error:'invalid_input'},400)}
  finally{running.delete(userId)}
}
