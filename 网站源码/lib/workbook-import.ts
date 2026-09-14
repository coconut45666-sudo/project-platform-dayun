import {unzipSync,strFromU8} from "fflate";
import {validDate,type CellEdit,type Records} from "./model";
const parseXML=(s:string)=>{const d=new DOMParser().parseFromString(s,"application/xml");if(d.getElementsByTagName("parsererror").length)throw Error("Excel 文件结构无法读取。");return d;};
const tag=(node:Document|Element,name:string)=>Array.from(node.getElementsByTagNameNS("*",name));
function time(v:string|number,excel=false,offset1904=false):string {
  if(excel&&typeof v==="number"){
    const ms=Math.round((v-(offset1904?24107:25569))*86400000);
    return new Date(Math.round(ms/60000)*60000).toISOString().slice(0,16);
  }
  let s=String(v).trim().replaceAll("/","-").replace(" ","T");
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))s+="T00:00";
  if(/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}(:00)?$/.test(s)){
    const m=s.match(/^(\d{4})-(\d+)-(\d+)T(\d+):(\d+)/)!;
    s=m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0")+"T"+m[4].padStart(2,"0")+":"+m[5];
  }
  if(!validDate(s))throw Error("无效日期或时刻："+String(v)+"。请使用 YYYY-MM-DD HH:mm。");
  return s;
}
export function readGrid(rows:(string|number|null)[][],ids:string[],original=false,offset1904=false):CellEdit[]{
  const edits:CellEdit[]=[];const seen=new Set<string>();
  const add=(date:string,id:string,raw:unknown)=>{
    if(raw===null||raw===undefined||raw==="")return;
    const value=typeof raw==="number"?raw:Number(String(raw).trim());
    if(!Number.isFinite(value))throw Error(date+" "+id+" 包含非数值："+raw);
    const key=date+"/"+id;
    if(seen.has(key))throw Error(date+" "+id+" 的时间重复，无法自动合并。");
    seen.add(key);edits.push({date,id,value});
  };
  if(original){
    const dates=rows[0]||[];
    dates.forEach((d,c)=>{
      const has=rows.slice(1,19).some(r=>r?.[c]!==undefined&&r[c]!==null&&r[c]!=="");
      if(!has)return;
      if(d===null||d===undefined||d==="")throw Error("原表第 "+(c+1)+" 列有数值但没有日期。");
      const date=time(d,true,offset1904);add(date,"PIT",rows[1]?.[c]);
      for(let i=1;i<=17;i++)add(date,"SW"+i,rows[i+1]?.[c]);
    });
    for(let r=19;r<rows.length;r++)if(rows[r].some(v=>v!==null&&v!==undefined&&v!==""))throw Error("原格式只识别坑内液面与 SW1–SW17。新增 NSW 请使用后台表格或带列名的导出表。");
  }else{
    if(!rows.length)throw Error("表格为空。");
    const head=rows[0].map(v=>String(v??"").trim().toUpperCase());
    const dateCol=head.findIndex(v=>["时间","日期","观测时间","DATETIME","DATE"].includes(v));
    if(dateCol<0)throw Error("首行必须有“时间”列，以及坑内液面、SW1、NSW1 等列名。");
    const cols=head.map((v,c)=>({id:["PIT","坑内液面","坑内水位液面"].includes(v)?"PIT":v,c})).filter(v=>v.id==="PIT"||ids.includes(v.id));
    if(!cols.length)throw Error("没有识别到坑内液面或测点列。");
    if(new Set(cols.map(c=>c.id)).size!==cols.length)throw Error("表头中有重复测点列。");
    for(const row of rows.slice(1)){
      if(row.every(v=>v===null||v===undefined||v===""))continue;
      const d=row[dateCol];if(d===null||d===undefined||d==="")throw Error("有数据行缺少时间。");
      const date=time(d,typeof d==="number",offset1904);
      for(const c of cols)add(date,c.id,row[c.c]);
    }
  }
  if(!edits.length)throw Error("未找到可导入的观测值。");
  return edits;
}
function csvRows(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;text=text.replace(/^\uFEFF/,"");
  for(let i=0;i<text.length;i++){const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell="";}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell="";}
    else cell+=c;
  }
  if(quoted)throw Error("CSV 引号未闭合。");
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}
export async function parseWorkbook(file:File,ids:string[]):Promise<{edits:CellEdit[];name:string}>{
  if(file.size>12*1024*1024)throw Error("文件须小于 12 MB。");
  if(file.name.toLowerCase().endsWith(".csv"))return {edits:readGrid(csvRows(await file.text()),ids),name:file.name};
  if(!file.name.toLowerCase().endsWith(".xlsx"))throw Error("请上传 .xlsx 或 UTF-8 CSV 文件。");
  const bytes=new Uint8Array(await file.arrayBuffer());let total=0;
  const z=unzipSync(bytes,{filter:f=>{total+=f.originalSize;if(total>64*1024*1024)throw Error("Excel 解压后过大，请移除不必要的图片后重试。");return /^(xl\/workbook.xml|xl\/_rels\/workbook.xml.rels|xl\/sharedStrings.xml|xl\/worksheets\/sheet\d+.xml)$/.test(f.name);}});
  const read=(p:string)=>{if(!z[p])throw Error("Excel 缺少必要工作表。");return parseXML(strFromU8(z[p]));};
  const workbook=read("xl/workbook.xml"),rels=read("xl/_rels/workbook.xml.rels"),sheets=tag(workbook,"sheet");
  const preferred=sheets.find(s=>(s.getAttribute("name")||"").includes("换算标高"))||sheets.find(s=>(s.getAttribute("name")||"").includes("数据维护"))||sheets[0];
  const name=preferred.getAttribute("name")||"工作表",rid=preferred.getAttribute("r:id");
  const target=tag(rels,"Relationship").find(r=>r.getAttribute("Id")===rid)?.getAttribute("Target");
  if(!target)throw Error("找不到工作表引用。");
  const path=target.startsWith("/")?target.slice(1):"xl/"+target.replace(/^\.\//,"");
  const strings=z["xl/sharedStrings.xml"]?tag(read("xl/sharedStrings.xml"),"si").map(si=>tag(si,"t").map(t=>t.textContent||"").join("")):[];
  const sheet=read(path);const rows:(string|number|null)[][]=[];
  for(const cell of tag(sheet,"c")){
    const a=cell.getAttribute("r")?.match(/^([A-Z]+)(\d+)$/);if(!a)continue;
    let c=0;for(const ch of a[1])c=c*26+ch.charCodeAt(0)-64;c--;
    const r=Number(a[2])-1;if(r>50000||c>16000)throw Error("工作表范围过大。");rows[r]??=[];
    const type=cell.getAttribute("t"),raw=tag(cell,"v")[0]?.textContent;
    if(tag(cell,"f").length&&raw===undefined)throw Error(a[0]+" 公式没有计算结果，请在 Excel 中重新计算并保存后上传。");
    if(type==="e")throw Error(a[0]+" 包含 Excel 公式错误："+raw);
    let value:string|number|null=null;
    if(type==="s")value=strings[Number(raw)]??"";
    else if(type==="inlineStr")value=tag(cell,"t").map(t=>t.textContent||"").join("");
    else if(raw!==undefined&&raw!==null&&raw!=="")value=type==="str"||type==="d"?raw:Number(raw);
    rows[r][c]=value;
  }
  const dense=Array.from({length:rows.length},(_,r)=>rows[r]||[]);
  const original=name.includes("换算标高");
  if(name==="地下水位曲线")throw Error("该工作表是毫米水位变化，不能直接作为以米计的标高。请使用“换算标高曲线”或后台导出的数据表。");
  return {edits:readGrid(dense,ids,original,tag(workbook,"workbookPr")[0]?.getAttribute("date1904")==="1"),name};
}
export function exportCSV(records:Records,ids:string[]){
  const rows=[["时间","坑内液面",...ids],...Object.keys(records).sort().map(d=>[d.replace("T"," "),records[d].PIT??"",...ids.map(id=>records[d][id]??"")])];
  const text="\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="大运水位数据.csv";a.click();URL.revokeObjectURL(url);
}

