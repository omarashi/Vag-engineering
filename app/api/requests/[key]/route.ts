import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canRecoverRequest } from "@/lib/permissions";
import { requestOutcome } from "@/lib/transaction";

export async function GET(request:Request,{params}:{params:Promise<{key:string}>}){
  const actor=await currentUser(request.headers);
  if(!actor) return Response.json({error:"unauthenticated"},{status:401});
  const {key}=await params;
  const result=await db.request.findFirst({where:{key,actorId:actor.id},select:{result:true}});
  const outcome=result && requestOutcome(result.result);
  // Older requests can still be replayed through their original authorized POST.
  return outcome && canRecoverRequest(actor.role,outcome.action)
    ? Response.json(outcome.response) : Response.json({error:"notFound"},{status:404});
}

