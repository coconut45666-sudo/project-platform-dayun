export type Point = { id: string; type: "SW" | "NSW"; x: number; y: number };
export type Section = { id: string; label: string; a: number[]; b: number[] };
export type Records = Record<string, Record<string, number>>;
export type Monitoring = { records: Records; revision: number; faulty: string[]; sections: Record<string,string>; sectionVersions?: Record<string,string>; source: string; warnings?: string[] };
export type CellEdit = { date: string; id: string; value: number | null };
export function deletionEdits(records:Records,dates:string[],ids:string[],wholeRows=false):CellEdit[]{
  return [...new Set(dates)].flatMap(date=>Object.keys(records[date]||{}).filter(id=>wholeRows||ids.includes(id)).map(id=>({date,id,value:null})));
}
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)) return false;
  const d = new Date(date + ":00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,16) === date;
}
export function mergeEdits(records: Records, edits: CellEdit[], ids: string[]): Records {
  if (!Array.isArray(edits) || !edits.length || edits.length > 50000) throw new Error("没有可保存的修改，或本次修改过多。");
  const next: Records = JSON.parse(JSON.stringify(records));
  const seen = new Set<string>();
  for (const e of edits) {
    if (!e || !validDate(e.date)) throw new Error("时间必须包含真实日期和时刻（YYYY-MM-DD HH:mm）。");
    if (e.id !== "PIT" && !ids.includes(e.id)) throw new Error("未知测点：" + e.id);
    if (seen.has(e.date + "/" + e.id)) throw new Error(e.date+" "+e.id+" 出现重复记录。");
    seen.add(e.date + "/" + e.id);
    if (e.value !== null && (typeof e.value !== "number" || !Number.isFinite(e.value))) throw new Error(e.date+" "+e.id+" 不是有效数值。");
    next[e.date] ??= {};
    if (e.value === null) delete next[e.date][e.id]; else next[e.date][e.id] = e.value;
  }
  for (const date of new Set(edits.map(e => e.date))) {
    if (Object.keys(next[date]).some(id => id !== "PIT") && next[date].PIT === undefined) throw new Error(date+" 缺少同一时刻的坑内液面，请补齐后再保存。");
    if (Object.keys(next[date]).length === 0) delete next[date];
  }
  return next;
}
export function closestSide(x:number,y:number,w:number,h:number): "left"|"right"|"top"|"bottom" {
  return ([['left',x],['right',w-x],['top',y],['bottom',h-y]] as const).reduce((a,b)=>b[1]<a[1]?b:a)[0];
}
