"use client";
import { Printer } from "lucide-react";
import { Button } from "./ui";
export function PrintButton({text}:{text:string}){
  return <Button variant="primary" type="button" onClick={()=>window.print()}><Printer size={16}/>{text}</Button>;
}

