import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request:Request,{params}:{params:Promise<{key:string}>}){
  const actor=await currentUser(request.headers);
  if(!actor) return Response.json({error:"unauthenticated"},{status:401});
  const {key}=await params;
  const result=await db.request.findFirst({where:{key,actorId:actor.id},select:{result:true}});
  return result ? Response.json(result.result) : Response.json({error:"notFound"},{status:404});
}

