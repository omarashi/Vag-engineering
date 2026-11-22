import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachmentRoot } from "@/lib/storage";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await currentUser(request.headers))return Response.json({error:"unauthenticated"},{status:401});
  const {id}=await params;
  const file=await db.attachment.findUnique({where:{id,OR:[{documentId:null},{document:{kind:{not:"quote"}}}]}});
  if(!file||!/^[a-f0-9-]{36}$/.test(file.key))return Response.json({error:"notFound"},{status:404});
  try{
    const data=await readFile(join(attachmentRoot(),file.key));
    return new Response(new Uint8Array(data),{headers:{"Content-Type":file.mime,"Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replaceAll("'","%27"),
      "X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"notFound"},{status:404});}
}

