import { resolve } from "node:path";

export const attachmentLimit=10*1024*1024;
export function attachmentRoot(){return resolve(/*turbopackIgnore: true*/ process.env.ATTACHMENT_DIR ?? "./data/attachments");}
export function signature(bytes:Buffer){
  if(bytes.subarray(0,5).toString()==="%PDF-")return "application/pdf";
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP")return "image/webp";
  return null;
}

