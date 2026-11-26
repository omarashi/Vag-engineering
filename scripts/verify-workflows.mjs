import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const suites={
  acceptance:["tests/acceptance.mjs"],
  receipts:["tests/receipts.mjs"],
  roles:["tests/roles.mjs"],
  accountant:["tests/accountant-workflow.mjs"],
  browser:["tests/browser.mjs"],
  photos:["node_modules/tsx/dist/cli.mjs","tests/photos.mjs"],
  mobile:["tests/mobile.mjs"],
};
const requested=process.argv.slice(2);
const selected=requested.length ? requested : Object.keys(suites);
if(selected.some(name=>!Object.hasOwn(suites,name))) throw new Error("Select a named workflow suite.");
if(!process.env.TEST_DATABASE_ADMIN_URL) throw new Error("Set TEST_DATABASE_ADMIN_URL to a local PostgreSQL test connection with CREATEDB.");
const adminUrl=new URL(process.env.TEST_DATABASE_ADMIN_URL);
if(!["127.0.0.1","localhost","[::1]"].includes(adminUrl.hostname)) throw new Error("Use a loopback PostgreSQL connection.");
adminUrl.pathname="/postgres";
adminUrl.search="";
const admin=new PrismaClient({adapter:new PrismaPg({connectionString:adminUrl.href})});
const runId=randomBytes(5).toString("hex");

function start(args,env){
  return spawn(process.execPath,args,{env,stdio:"inherit",windowsHide:true});
}

async function execute(args,env){
  const [code]=await once(start(args,env),"exit");
  if(code!==0) throw new Error(args.join(" ")+" exited with "+code);
}

async function freePort(){
  const server=createServer();
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  const {port}=server.address();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

async function ready(server,url){
  for(let retry=0;retry<80 && server.exitCode===null;retry++){
    const response=await fetch(url+"/api/health",{signal:AbortSignal.timeout(1000)}).catch(()=>null);
    if(response?.ok) return;
    await wait(250);
  }
  throw new Error("The isolated test server did not become healthy.");
}

try{
  // Match the asset layout used by the production Docker image.
  await cp(".next/static",".next/standalone/.next/static",{recursive:true});
  await cp("public",".next/standalone/public",{recursive:true});
  for(const name of selected){
    const database="vag_verify_"+runId+"_"+name+"_test";
    const url=new URL(adminUrl);
    url.pathname="/"+database;
    const attachments=await mkdtemp(join(tmpdir(),"vag-verify-"+name+"-"));
    const port=await freePort();
    const base="http://127.0.0.1:"+port;
    const env={...process.env,DATABASE_URL:url.href,ATTACHMENT_DIR:attachments,TEST_URL:base,HOSTNAME:"127.0.0.1",PORT:String(port),
      BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(32).toString("hex"),
      BOOTSTRAP_USERNAME:"owner",BOOTSTRAP_NAME:"Omar Khaled",BOOTSTRAP_PASSWORD:"Demo-Workshop-2026!"};
    let child;
    let created=false;
    try{
      console.log("Verifying "+name+" in "+database);
      // The identifier consists only of the generated hex ID and a fixed suite name.
      await admin.$executeRawUnsafe('CREATE DATABASE "'+database+'" TEMPLATE template0 ENCODING \'UTF8\' LOCALE \'C\'');
      created=true;
      await execute(["node_modules/prisma/build/index.js","migrate","deploy"],env);
      await execute(["node_modules/tsx/dist/cli.mjs","scripts/bootstrap.ts"],env);
      await execute(["node_modules/tsx/dist/cli.mjs","tests/seed.ts"],env);
      child=start([".next/standalone/server.js"],env);
      await ready(child,base);
      await execute(suites[name],env);
    } finally {
      if(child && child.exitCode===null && child.signalCode===null){
        const exited=once(child,"exit");
        child.kill();
        await exited;
      }
      if(created) await admin.$executeRawUnsafe('DROP DATABASE "'+database+'" WITH (FORCE)');
      await rm(attachments,{recursive:true,force:true});
    }
  }
} finally {
  await admin.$disconnect();
}
