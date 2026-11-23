import { mutationUser } from "@/lib/auth";
import { command } from "@/lib/commands";
import { RuleError } from "@/lib/rules";
import { Prisma } from "@prisma/client";

export async function POST(request:Request, {params}:{params:Promise<{action:string}>}) {
  const requestId=request.headers.get("idempotency-key") ?? "";
  try {
    const actor=await mutationUser(request);
    if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({error:"invalid"},{status:415});
    const body=await request.text();
    if(body.length>160000) return Response.json({error:"invalid"},{status:413});
    const {action}=await params;
    if(["appointment","appointmentStatus"].includes(action)) return Response.json({error:"unknownAction"},{status:404});
    return Response.json(await command(actor,action,requestId,JSON.parse(body)));
  } catch(error){
    if(error instanceof RuleError) return Response.json({error:error.code},{status:error.status});
    if(error instanceof SyntaxError) return Response.json({error:"invalid"},{status:400});
    if(error instanceof Prisma.PrismaClientKnownRequestError && ["P2002","P2003","P2025"].includes(error.code)){
      return Response.json({error:"recordConflict"},{status:409});
    }
    console.error("ERP action failed", {requestId:requestId.slice(0,80), error:error instanceof Error ? error.name : "unknown", code:error instanceof Prisma.PrismaClientKnownRequestError?error.code:undefined});
    return Response.json({error:"serverError"},{status:500});
  }
}

