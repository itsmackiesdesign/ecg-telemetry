import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getAppUser} from '@/lib/app-auth';
export const dynamic='force-dynamic';
export async function GET(){
 const bindings=env as {OPENAI_API_KEY?:string};
 return Response.json({configured:Boolean(bindings.OPENAI_API_KEY?.trim()),signed_in:Boolean(await getAppUser()||await getChatGPTUser())},{headers:{'Cache-Control':'no-store'}});
}
