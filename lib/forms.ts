import type { ActionSpec, Field, Option } from "@/components/backoffice-form";
import { day, label, moneyInput, type Language } from "./locale";
import { demoPartNamesArabic } from "./egyptian";
import type { selections } from "./views";
import { moneyAccountKinds, today } from "./rules";
import { prefixes } from "./transaction";
import type { Actor } from "./transaction";
import { can } from "./permissions";
import { carName } from "./car-name";
import { jobStates } from "./workshop";

export type Choices=Awaited<ReturnType<typeof selections>>;
type Row=Record<string,unknown>;
const value=(row:Row,key:string)=>row[key]==null?"":String(row[key]);
const txt=(key:string,label:string,required=false,value="",ltr=false):Field=>({key,label,required,value,ltr});
const memo=(key:string,label:string,value="",required=false):Field=>({key,label,type:"textarea",wide:true,value,required});
const check=(key:string,label:string,value=false):Field=>({key,label,type:"check",value});
const choose=(key:string,label:string,options:Option[],required=false,value="",depends?:string):Field=>({key,label,type:"select",options,required,value,depends});
const when=(key="at",label="Date",value=today(),required=false,type:Field["type"]="date"):Field=>({key,label,type,value,required,ltr:true});
const idOptions=(rows:{id:string;name:string}[]):Option[]=>rows.map((item)=>({value:item.id,name:item.name}));
export const post=(action:string,title:string,fields:Field[]=[],hidden:Row={},destination?:string):ActionSpec=>({action,title,fields,hidden,post:true,destination});
export const edit=(action:string,title:string,fields:Field[],row:Row={},destination?:string):ActionSpec=>({
  action,title,fields,hidden:row.id?{id:row.id,version:row.version,updatedAt:row.updatedAt}:{},destination,
});
export function forms(lang:Language,data:Choices,actor:Actor){
  const enumeration=(keys:readonly string[])=>keys.map((value)=>({value,name:label(lang,value)}));
  const customer=idOptions(data.customers),supplier=idOptions(data.suppliers),staff=idOptions(data.staff),accounts=idOptions(data.accounts);
  const catalogue=(group:string)=>data.catalogue.filter((item)=>item.group===group).map((item)=>({value:item.name,name:item.name,price:moneyInput(item.price)}));
  const paymentMethods=[...enumeration(["cash","bank","card","transfer"]),...catalogue("paymentMethod")]
    .filter((item,index,all)=>all.findIndex((prior)=>prior.value===item.value)===index);
  const cars=data.cars.map((item)=>({value:item.id,related:item.partyId,name:[carName(item),item.plate].filter(Boolean).join(" · ")}));
  const stockOptions=(localizeDemoNames=false)=>data.stock.map((item)=>{
    const name=localizeDemoNames && item.code.startsWith("DEMO-") ? demoPartNamesArabic[item.name] ?? item.name : item.name;
    return {value:item.id,name:item.code+" · "+name,price:moneyInput(item.price),cost:moneyInput(item.cost),version:item.version};
  });
  const parts=stockOptions();
  const destinations=data.payables.map((item)=>({value:item.id,name:item.number+" · "+label(lang,item.kind)+" · "+moneyInput(item.total),
    related:[item.partyId ?? "",item.employeeId ?? "",item.kind].join("|")}));
  const jobs=data.work.map((item)=>({value:item.id,name:item.number+" · "+item.title,related:item.partyId ?? ""}));
  const staffField=(key="employees",text="Technicians",ids:string[]=[]):Field=>({key,label:text,type:"multi",options:staff,wide:true,value:ids});
  const m=(key:string,text:string,row:Row={},required=false)=>txt(key,text,required,moneyInput(row[key]),true);
  const metadata=(row:Row)=>(row.metadata ?? {}) as Row;
  const str=(row:Row,key:string)=>value(row,key);
  const dated=(row:Row,key:string)=>(row[key]?new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(str(row,key))):"");
  const dateFields=()=>[when(),when("dueAt","Due date","")];
  const staffIds=(row:Row,completed=false)=>((row.assignments ?? []) as {employeeId:string;completed:boolean}[]).filter((item)=>!completed||item.completed).map((item)=>item.employeeId);
  const businessKinds=["invoice","purchase","customerOpening","supplierOpening","credit","supplierCredit","expense","payroll","employeeOpening","advanceOpening"];
  const ret={
    can:(action:string)=>can(actor.role,action),
    party:(kind:"customer"|"supplier",row:Row={})=>edit(kind,row.id?"Edit":kind==="customer"?"Add customer":"Add supplier",[
      txt("name","Name",true,str(row,"name")),txt("phone","Phone",false,str(row,"phone"),true),
      txt("contact","Alternative contact",false,str(row,"contact")),txt("address","Address",false,str(row,"address")),
      memo("note","Notes",str(row,"note")),check("archived","Archived",row.archived===true),
    ],row,kind==="customer"?"/customers/$id":"/purchasing/$id"),
    vehicle:(row:Row={},partyId="")=>edit("vehicle",row.id?"Edit":"Add vehicle",[
      choose("partyId","Customer",customer,true,str(row,"partyId")||partyId),txt("plate","Plate",false,str(row,"plate"),true),
      txt("make","Make",false,str(row,"make")),txt("model","Model",true,str(row,"model")),
      txt("color","Color",false,str(row,"color")),txt("year","Year",false,str(row,"year"),true),
      txt("stage","Tuning stage",false,str(row,"stage")),txt("mileage","Mileage",false,str(row,"mileage"),true),
      txt("vin","VIN",false,str(row,"vin"),true),txt("engine","Engine code",false,str(row,"engine"),true),
      txt("transmission","Transmission",false,str(row,"transmission")),memo("note","Notes",str(row,"note")),
      ...(row.id?[memo("reason","Reason or approval"),check("archived","Archived",row.archived===true)]:[]),
    ],row,"/vehicles/$id"),
    vehicleNote:(row:Row)=>edit("vehicleNote","Add history entry",[choose("kind","Type",enumeration(["maintenance","tuning","modification"]),true,"maintenance"),when(),memo("note","Notes","",true)],{...row,id:undefined}),
    part:(row:Row={})=>edit("part",row.id?"Edit":"Add part",[
      txt("code","Code",true,str(row,"code"),true),txt("name","Name",true,str(row,"name")),txt("category","Category",false,str(row,"category")),
      txt("unit","Unit",true,str(row,"unit")||"pc"),txt("oem","OEM number",false,str(row,"oem"),true),txt("brand","Brand",false,str(row,"brand")),
      txt("location","Location",false,str(row,"location")),txt("minimum","Minimum",false,str(row,"minimum")||"0",true),
      m("cost","Cost",row),m("price","Price",row),memo("note","Notes",str(row,"note")),check("archived","Archived",row.archived===true),
    ],row,"/inventory/$id"),
    employee:(row:Row={})=>edit("employee",row.id?"Edit profile":"Add employee",[
      txt("name","Name",true,str(row,"name")),txt("phone","Phone",false,str(row,"phone"),true),txt("arrangement","Pay arrangement",false,str(row,"arrangement")),
      m("weeklySalary","Weekly salary (EGP)",row),
      choose("paidDaysPerWeek","Paid days per week",[1,2,3,4,5,6,7].map(day=>({value:String(day),name:String(day)})),true,str(row,"paidDaysPerWeek")||"6"),
      m("rate","Rate",row),
      when("effectiveAt","Effective date",dated(row,"effectiveAt")||today()),when("startedAt","Start date",dated(row,"startedAt")||today()),
      ...(can(actor.role,"employeeDismiss")&&!row.dismissalReason?[when("endedAt","End date",dated(row,"endedAt")),check("archived","Archived",row.archived===true)]:[]),
      memo("note","Notes",str(row,"note")),
    ],row,"/payroll/$id"),
    account:(row:Row={})=>edit("account",row.id?"Edit account":"Add account",[
      txt("name","Name",true,str(row,"name")),choose("kind","Account type",enumeration(moneyAccountKinds),true,str(row,"kind")||"cash"),
      check("archived","Archived",row.archived===true),
    ],row),
    catalogue:(row:Row={})=>edit("catalogue",row.id?"Edit":"Add catalogue item",[
      choose("group","Type",enumeration(["service","make","model","stage","expenseCategory","paymentMethod","location"]),true,str(row,"group")||"service"),
      txt("name","Name",true,str(row,"name")),m("price","Price",row),memo("description","Description",str(row,"description")),check("archived","Archived",row.archived===true),
    ],row),
    settings:(row:Row,custom:Record<string,string>)=>({...edit("settings","Business settings",[
      txt("name","Business name",true,str(row,"name")||"VAG Engineering"),txt("phone","Phone",false,str(row,"phone"),true),
      check("workshopPhotos","Enable workshop photos",row.workshopPhotos===true),
      txt("address","Address",false,str(row,"address")),txt("logo","Logo path",false,str(row,"logo")||"/brand.jpg",true),
      choose("dateFormat","Date format",enumeration(["short","medium","long"]),true,str(row,"dateFormat")||"medium"),
      memo("footer","Invoice footer",str(row,"footer")),...Object.entries(prefixes).filter(([kind])=>kind!=="appointment").map(([kind,defaultPrefix])=>txt("prefix-"+kind,label(lang,kind),false,custom[kind]||defaultPrefix,true)),
    ]),hidden:{version:row.version ?? 0}}),
    user:(row:Row={},protectOwner=false)=>{
      const spec=edit("user",row.id?"Edit login":"Add user",[
        txt("name","Display name",true,str(row,"name")),{...txt("email","Email",true,str(row,"email"),true),type:"email"},
        ...(!protectOwner?[choose("role","Role",enumeration(["owner","accountant","technician"]),true,str(row,"role")||"technician")]:[]),
        {...txt("password",row.id?"New password (optional)":"New password",!row.id),type:"password"},
        ...(!protectOwner?[check("active","Active account",row.active!==false)]:[]),
      ],row);
      return protectOwner?{...spec,hidden:{...spec.hidden,role:"owner",active:true}}:spec;
    },
    appointment:(row:Row={})=>{
      const at=row.at?new Intl.DateTimeFormat("sv-SE",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(str(row,"at"))).replace(" ","T"):today()+"T09:00";
      return edit("appointment",row.id?"Edit":"Book appointment",[
        choose("partyId","Customer",customer,true,str(row,"partyId")),choose("vehicleId","Vehicle",cars,false,str(row,"vehicleId"),"partyId"),
        when("at","Starts at (Cairo)",at,true,"datetime-local"),txt("duration","Duration (minutes)",true,value(metadata(row),"duration")||"60",true),
        txt("title","Service",true,str(row,"title")),staffField("employees","Technicians",staffIds(row)),memo("note","Notes",str(row,"note")),memo("reason","Reason or approval"),
      ],row,"/record/$id");
    },
    appointmentStatus:(row:Row)=>edit("appointmentStatus","Update status",[choose("status","Status",enumeration(["scheduled","arrived","completed","cancelled","noShow"]),true,str(row,"status"))],row),
    job:(source?:Row)=>({...edit("job",source?"Create job":"New job",[
      ...(!source?[choose("partyId","Customer",customer,true),choose("vehicleId","Vehicle",cars,true,"","partyId")]:
        !source.vehicleId?[choose("vehicleId","Vehicle",cars.filter((item)=>item.related===source.partyId),true)]:[]),
      txt("title","Title",true,source?str(source,"title"):""),when(),txt("mileage","Mileage",false,"",true),
      ...(!source?[staffField()]:[]),memo("requested","Complaint / requested work"),memo("note","Notes",source?str(source,"note"):""),memo("reason","Reason or approval"),
    ],{},"/jobs/$id"),hidden:source?{sourceId:source.id}:undefined}),
    jobUpdate:(row:Row)=>edit("jobUpdate","Update job",[
      choose("status","Status",enumeration(jobStates),true,str(row,"status")),
      txt("stage","Tuning stage"),memo("note","Notes",str(row,"note")),memo("inspection","Inspection",value(metadata(row),"inspection")),
      memo("work","Work notes",value(metadata(row),"work")),memo("ecu","ECU notes",value(metadata(row),"ecu")),memo("tcu","TCU notes",value(metadata(row),"tcu")),
      txt("dynoBefore","Dyno before",false,value(metadata(row),"dynoBefore")),txt("dynoAfter","Dyno after",false,value(metadata(row),"dynoAfter")),
      when("followUp","Follow-up date",value(metadata(row),"followUp")),txt("followMileage","Follow-up mileage",false,value(metadata(row),"followMileage")),memo("reason","Reason"),
    ],row),
    assign:(row:Row)=>edit("jobAssignment","Assign technicians",[staffField("employees","Technicians",staffIds(row)),staffField("completed","Completed technicians",staffIds(row,true))],row),
    jobStock:(row:Row)=>post("jobStock","Stock movement",[
      choose("kind","Type",enumeration(["reserve","release","issue","jobReturn"]),true,can(actor.role,"payment")?"reserve":"issue"),
      choose("partId","Part",parts.map(({value,name})=>({value,name})),true),
      txt("quantity","Quantity",true,"1",true),memo("reason","Reason"),
    ],{jobId:row.id}),
    stock:(row?:Row,opening=false)=>post("stock",opening?"Record opening stock":"Adjustment or count",[
      choose("partId","Part",parts,true,row?str(row,"id"):""),...(!opening?[choose("kind","Type",enumeration(["adjustment","count"]),true,"adjustment")]:[m("cost","Cost",{},true)]),
      txt("quantity","Quantity",true,"",true),when(),memo("reason","Reason","",true),
    ],opening?{kind:"opening"}:{}),
    invoice:(row:Row):ActionSpec=>{
      const stock = (row.jobStock ?? []) as {issued:string;part:{id:string;code:string;name:string;price:string}}[];
      const issuedParts = stock.filter(({issued})=>Number(issued)>0).map(({part,issued})=>({
        value:part.id,name:part.code+" · "+part.name,price:moneyInput(part.price),quantity:issued,
      }));
      return {
        ...post("invoice","Post job invoice",[...dateFields(),memo("note","Notes")],{jobId:row.id},"/record/$id"),
        editor:"lines",parts:issuedParts,services:catalogue("service"),
        initialLines:issuedParts.map(({value,name,price,quantity})=>({
          kind:"part",partId:value,description:name,quantity,price,discount:"0",
        })),
      };
    },
    purchase:(kind:"purchase"|"purchaseOrder",row?:Row)=>({...post(kind,row?"Receive order":kind==="purchase"?"New purchase":"New purchase order",[
      ...(!row?[choose("partyId","Supplier",supplier,true)]:[]),...(kind==="purchase"?[txt("reference","Reference",true)]:[]),...dateFields(),memo("note","Notes"),
    ],row?{sourceId:row.id}:{},"/record/$id"),editor:row?undefined:"lines" as const,
      parts:kind==="purchase" && !row && lang==="ar" ? stockOptions(true) : parts,onlyParts:true,purchase:true}),
    expense:()=>post("expense","New expense",[txt("title","Title",true),catalogue("expenseCategory").length?choose("category","Category",catalogue("expenseCategory"),true):txt("category","Category",true),
      txt("payee","Payee"),m("amount","Amount",{},true),when(),memo("note","Notes")],{},"/record/$id"),
    credit:(row:Row)=>({...post("credit","Add credit / return",[when(),m("amount","Amount"),memo("reason","Reason","",true)],{sourceId:row.id},"/record/$id"),
      editor:"returns" as const,purchase:["purchase","supplierOpening"].includes(str(row,"kind")),
      options:((row.lines ?? []) as {id:string;description:string;quantity:string}[]).map((line)=>({value:line.id,name:line.description+" · "+line.quantity})),
    }),
    reverse:(row:Row,payment=false)=>post(payment?"reversePayment":"reverseDocument",payment?"Reverse payment":"Reverse document",[when(),memo("reason","Reason","",true)],{id:row.id}),
    payment:(row?:Row,job?:Row,opening=false,receiptOnly=false)=>{
      const map:Record<string,string>={invoice:"receipt",customerOpening:"receipt",purchase:"supplierPayment",supplierOpening:"supplierPayment",
        credit:"refund",supplierCredit:"supplierRefund",expense:"expensePayment",payroll:"salaryPayment",employeeOpening:"salaryPayment"};
      const build=(kind:string):Field[]=>{
        const picker=kind==="receipt"||kind==="refund"?customer:kind==="supplierPayment"||kind==="supplierRefund"?supplier:null;
        const filtered=[...(picker?[choose("partyId",picker===customer?"Customer":"Supplier",picker,true,str(row ?? job ?? {},"partyId"))]:[]),
          ...(["advance","salaryPayment"].includes(kind)?[choose("employeeId","Employee",staff,true,str(row ?? {},"employeeId"))]:[]),
          ...(["receipt","supplierPayment"].includes(kind)?[check("allowCredit","Allow unallocated credit",Boolean(job))]:[]),
          ...(kind==="receipt"&&!job?[choose("jobId","Workshop jobs",jobs,false,"","partyId")]:[])];
        return filtered;
      };
      const paymentKinds=["supplierPayment","refund","supplierRefund","expensePayment","salaryPayment","advance"];
      const kind=opening?"cashOpening":job||receiptOnly?"receipt":row?map[str(row,"kind")]:paymentKinds[0];
      const dynamic=Object.fromEntries(paymentKinds.map((key)=>[key,build(key)]));
      const title=opening?"Record opening cash":receiptOnly?"Record a receipt":
        ["refund","supplierRefund"].includes(kind)?"Record refund":"Record payment";
      const spec={...post("payment",title,[
        ...(!row&&!job&&!opening&&!receiptOnly?[choose("kind","Type",enumeration(paymentKinds),true,kind)]:build(kind)),
        choose("accountId","Account",accounts,true),
        choose("method","Payment method",paymentMethods,true,"cash"),
        m("amount",kind==="receipt"?"Amount to apply (EGP)":"Amount",{amount:row?.due},true),
        ...(kind==="receipt"?[{...m("cashTendered","Cash handed over (EGP)"),inputMode:"decimal" as const,
          depends:"method",showWhen:{key:"method",value:"cash"}}]:[]),
        when(),memo("note","Notes","",opening||["refund","supplierRefund"].includes(kind)),
      ],{...(row||job||opening||receiptOnly?{kind}:{}),...(job?{jobId:job.id}:{})},"/payment/$id"),
        editor:opening?undefined:"allocations" as const,
        options:row?destinations.filter((item)=>item.value===row.id):destinations,dynamic:!row&&!job&&!opening&&!receiptOnly?dynamic:undefined,
        ...(row?{initialAllocation:{documentId:str(row,"id"),amount:moneyInput(row.due)}}:{}),
      };
      return spec;
    },
    receipt:():ActionSpec=>ret.payment(undefined,undefined,false,true),
    allocate:(row:Row)=>({...post("allocate","Allocate credit or advance",[],{id:row.id}),editor:"allocations" as const,
      options:destinations.filter((item)=>{const [party,staff,kind]=(item.related ?? "").split("|"); return row.kind==="receipt"?party===row.partyId&&["invoice","customerOpening"].includes(kind):row.kind==="supplierPayment"?party===row.partyId&&["purchase","supplierOpening"].includes(kind):staff===row.employeeId&&["payroll","employeeOpening"].includes(kind);})}),
    unallocate:(id:string)=>post("unallocate","Unallocate",[memo("reason","Reason","",true)],{id}),
    cashMovement:(kind:"transfer"|"contribution"|"withdrawal")=>{
      const title={transfer:"Transfer between accounts",contribution:"Record owner contribution",withdrawal:"Record owner withdrawal"}[kind];
      return post("payment",title,[
        choose("accountId",kind==="transfer"?"Source account":"Account",accounts,true),
        kind==="transfer"?choose("toAccountId","Destination account",accounts,true):
          choose("method","Payment method",paymentMethods,true,"cash"),
        m("amount","Amount",{},true),when(),memo("note","Reason","",true),
      ],{kind},"/payment/$id");
    },
    opening:()=>({...post("opening","Add opening item",[
      choose("kind","Type",enumeration(["customerOpening","supplierOpening","employeeOpening","advanceOpening"]),true,"customerOpening"),
      txt("reference","Reference",true),m("amount","Amount",{},true),...dateFields(),memo("note","Notes"),
    ],{},"/record/$id"),dynamic:{customerOpening:[choose("partyId","Customer",customer,true)],supplierOpening:[choose("partyId","Supplier",supplier,true)],
      employeeOpening:[choose("employeeId","Employee",staff,true)],advanceOpening:[choose("employeeId","Employee",staff,true)]}}),
    openingFinalize:()=>post("openingFinalize","Finalize openings",[when(),memo("note","Notes","",true)]),
    payEntry:(row:Row)=>post("payEntry","Add pay entry",[
      choose("kind","Type",enumeration((metadata(row).locked ? ["correction"] : ["base","daily","commission","bonus","deduction","openingRecovery","correction"])),true,metadata(row).locked?"correction":"base"),
      m("amount","Amount",{},true),txt("reference","Reference"),memo("note","Notes"),
    ],{id:row.id}),
    payFinalize:(row:Row)=>post("payFinalize","Finalize period",[],{id:row.id}),
    adapters:{customer,supplier,staff,parts,cars,accounts,enumeration,businessKinds,day},
  };
  return ret;
}
export type Forms=ReturnType<typeof forms>;

