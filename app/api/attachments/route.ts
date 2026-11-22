import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/transaction";
import { attachmentLimit,attachmentRoot,signature } from "@/lib/storage";

export async function POST(request:Request){
  if(request.headers.get("origin")!==(process.env.BETTER_AUTH_URL ?? new URL(request.url).origin))return Response.json({error:"forbidden"},{status:403});
  const actor=await currentUser(request.headers);
  if(!actor)return Response.json({error:"unauthenticated"},{status:401});
  const length=Number(request.headers.get("content-length") ?? "0");
  if(length>attachmentLimit+65536)return Response.json({error:"invalidFile"},{status:413});
  const content=await request.formData().catch(()=>null);
  const file=content?.get("file");
  const type=content?.get("type");
  const id=content?.get("target");
  if(typeof id!=="string"||id.length>100||!(file instanceof File)||file.size>attachmentLimit||file.size===0)return Response.json({error:"invalidFile"},{status:422});
  const vehicle=type==="vehicle" ? await db.vehicle.findUnique({where:{id}}) : null;
  const document=type==="document" ? await db.document.findUnique({where:{id,kind:{not:"quote"}}}) : null;
  if(!vehicle&&!document)return Response.json({error:"invalidDocument"},{status:404});
  if(actor.role==="technician"&&!vehicle&&(!document||!["job","appointment"].includes(document.kind)))return Response.json({error:"forbidden"},{status:403});
  const body=Buffer.from(await file.arrayBuffer());
  const mime=signature(body);
  if(!mime||mime!==file.type)return Response.json({error:"invalidFile"},{status:422});
  const key=randomUUID();const root=attachmentRoot();const path=join(root,key);
  let written=false;
  try{
    await db.$transaction(async(tx)=>{
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(7362371)`;
      const live=await tx.user.findUnique({where:{id:actor.id}});
      if(!live?.active || live.role==="technician"&&!vehicle&&(!document||!["job","appointment"].includes(document.kind)))throw Error("permission");
      await mkdir(root,{recursive:true});
      await writeFile(path,body,{flag:"wx",mode:0o600});written=true;
      const name=file.name.replace(/[\u0000-\u001F\u007F/\\]/g,"_").slice(0,150);
      const row=await tx.attachment.create({data:{documentId:document?.id,vehicleId:vehicle?.id,name,mime,size:file.size,key,actorId:actor.id}});
      await audit(tx,actor.id,"attachment","attachment",row.id,null,{name,mime,id});
    });
    return Response.json({ok:true},{status:201});
  }catch(error){
    if(written)await unlink(path).catch(()=>{});
    return Response.json({error:error instanceof Error&&error.message==="permission"?"forbidden":"serverError"},{status:error instanceof Error&&error.message==="permission"?403:500});
  }
}

