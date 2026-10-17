import { randomUUID } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { ensurePersistenceSchema,getDatabase } from "@/lib/database";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const COOKIE="speakup_owner";
type Row={exerciseId:string;kind:"word"|"sentence";topic:string;prompt:string;response:string;score:number;feedbackJson:string;createdAt:string};
function respond(body:unknown,request:NextRequest,owner:string){const r=NextResponse.json(body,{headers:{"Cache-Control":"no-store"}});if(!request.cookies.has(COOKIE))r.cookies.set(COOKIE,owner,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:31536000});return r}
export async function GET(request:NextRequest){const owner=request.cookies.get(COOKIE)?.value??randomUUID();try{ensurePersistenceSchema();const rows=getDatabase().prepare("SELECT exercise_id AS exerciseId,exercise_kind AS kind,topic,prompt,response_text AS response,score,feedback_json AS feedbackJson,created_at AS createdAt FROM word_sentence_practice_attempts WHERE owner_id=? ORDER BY created_at DESC LIMIT 100").all(owner) as Row[];const history=rows.map(x=>{let p:unknown={};try{p=JSON.parse(x.feedbackJson)}catch{/* keep safe empty result */}const f=p&&typeof p==="object"&&!Array.isArray(p)?p as Record<string,unknown>:{};return{id:x.exerciseId,kind:x.kind,topic:x.topic,prompt:x.prompt,response:x.response,score:x.score,createdAt:x.createdAt,feedback:typeof f.feedback==="string"?f.feedback:"",corrections:Array.isArray(f.corrections)?f.corrections:[]}});return respond({history},request,owner)}catch(e){console.error("Practice history unavailable:",e);return respond({error:"Practice history is unavailable right now."},request,owner)}}
