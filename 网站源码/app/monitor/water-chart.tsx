"use client";
import {useMemo,useState} from "react";
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip} from "recharts";
import type {Monitoring} from "@/lib/model";
export default function WaterChart({id,data,wide=false}:{id:string;data:Monitoring;wide?:boolean}) {
  const observed=Object.keys(data.records).filter(d=>data.records[d][id]!==undefined).sort();
  const [from,setFrom]=useState(""); const [to,setTo]=useState("");
  const first=observed[0], last=observed.at(-1);
  const rows=useMemo(()=>Object.keys(data.records).sort().filter(d=>d>=(from?from+"T00:00":first||"")&&d<=(to?to+"T23:59":last||"9999"))
    .map(d=>({date:d,time:Date.parse(d+":00Z"),point:data.records[d][id]??null,pit:data.records[d].PIT??null})),[data,id,from,to,first,last]);
  const days=[...new Set(rows.map(r=>r.date.slice(0,10)))];
  const ticks=days.filter((_,i)=>i%Math.max(1,Math.ceil(days.length/5))===0).map(day=>rows.find(r=>r.date.startsWith(day))!.time);
  if(!observed.length) return <div className="empty-detail"><span className="empty-dot" style={{borderColor:"#d4329c"}}/><h3>暂无观测数据</h3><p>{id} · 新水位监测点</p></div>;
  const date=last!,value=data.records[date][id],pit=data.records[date].PIT;
  return <div className={"water-content "+(wide?"wide-chart":"")}>
    <div className="reading-row"><div><span>观测水位</span><strong>{value.toFixed(3)}<small>m</small></strong></div><div><span>同刻坑内液面</span><strong>{pit===undefined?"—":pit.toFixed(3)}<small>m</small></strong></div><div className="observed-date"><span>最近观测</span><b>{date.replace("T"," ")}</b></div></div>
    <div className="chart-legend"><span><i style={{background:id.startsWith("NSW")?"#d4329c":"#263b5b"}}/>{id}</span><span><i style={{background:"#009a9b"}}/>坑内液面</span><em>高程 / m</em></div>
    <div className="chart-area">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{top:10,right:14,left:0,bottom:6}}>
          <CartesianGrid stroke="#e4e9ee" vertical={false} strokeDasharray="3 3"/>
          <XAxis dataKey="time" type="number" domain={["dataMin","dataMax"]} scale="time" tickFormatter={v=>new Date(v).toISOString().slice(5,10)} minTickGap={40} ticks={ticks} tick={{fontSize:12,fill:"#67768a"}} axisLine={false} tickLine={false}/>
          <YAxis domain={["auto","auto"]} width={49} tick={{fontSize:12,fill:"#67768a"}} tickFormatter={v=>Number(v).toFixed(1)} axisLine={false} tickLine={false}/>
          <Tooltip labelFormatter={v=>new Date(Number(v)).toISOString().slice(0,16).replace("T"," ")} formatter={(v,name)=>[v===null?"缺测":Number(v).toFixed(3)+" m",name]} contentStyle={{border:"1px solid #d7e0e9",borderRadius:8,fontSize:13}}/>
          <Line name={id} type="linear" dataKey="point" stroke={id.startsWith("NSW")?"#d4329c":"#263b5b"} strokeWidth={2} dot={rows.length<40?{r:2}:{r:1.6}} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>
          <Line name="坑内液面" type="linear" dataKey="pit" stroke="#009a9b" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls={false} isAnimationActive={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="date-window"><label>从<input type="date" value={from||first?.slice(0,10)} onChange={e=>setFrom(e.target.value)} max={to||last?.slice(0,10)}/></label><span>—</span><label>至<input type="date" value={to||last?.slice(0,10)} onChange={e=>setTo(e.target.value)} min={from||first?.slice(0,10)}/></label><button onClick={()=>{setFrom("");setTo("");}}>全部</button></div>
    <p className="detail-footnote">{observed.length} 次观测 · {first?.slice(0,10)} 至 {last?.slice(0,10)} · 悬停查看具体时刻</p>
  </div>;
}

