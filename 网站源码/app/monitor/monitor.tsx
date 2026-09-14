"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from "react";
import {Plus,Minus,Scan,MapPin,Layers,Droplets,X,Move,Grip,LockKeyhole,Maximize2,Code2,ChevronDown} from "lucide-react";
import {Popover,PopoverContent,PopoverTrigger} from "@/components/ui/popover";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import mapJson from "@/data/map.json";
import labelsJson from "@/data/point-labels.json";
import {fitRect,nearestSide,placePanel,panToReveal,zoomAt,type Camera,type XY,type Rect} from "@/lib/canvas-geometry";
import type {Point,Section,Monitoring} from "@/lib/model";
import WaterChart from "./water-chart";
import SectionViewer from "./section-viewer";

import {BRIDGE_CHANNEL,parseBridgeMessage,type BridgeCommand} from "@/lib/module-bridge";
import {appConfig,appFetch,appUrl} from "@/lib/app-runtime";
const map=mapJson as {width:number;height:number;points:Point[];sections:Section[]};
const labels=labelsJson as Record<string,number[]>;
const activeBounds={x:125,y:180,w:1305,h:1175};
type Selection={id:string;kind:"point"|"section";x:number;y:number};
type Panel=Rect;
type Drag={mode:"pan"|"map"|"panel"|"resize";start:XY;camera:Camera;mapPos:XY;panel:Panel|null;moved:boolean};
export default function Monitor({initialAdmin=false}:{initialAdmin?:boolean}){
 const [data,setData]=useState<Monitoring|null>(null),[error,setError]=useState("");
 const [camera,setCamera]=useState<Camera>({x:0,y:0,k:.6}),[mapPos,setMapPos]=useState<XY>({x:0,y:0});
 const [size,setSize]=useState({w:1200,h:800}),[selection,setSelection]=useState<Selection|null>(null),[panel,setPanel]=useState<Panel|null>(null);
 const [layers,setLayers]=useState({SW:true,NSW:true,sections:true}),[admin,setAdmin]=useState(initialAdmin),[indexOpen,setIndexOpen]=useState(false);
 const [embedded,setEmbedded]=useState(false),[offline,setOffline]=useState(false);
 const bridge=useRef<(message:BridgeCommand)=>void>(()=>{});
 const stage=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),space=useRef(false),initialized=useRef(false);
 const pointers=useRef(new Map<number,XY>()),pinch=useRef<{distance:number;center:XY;camera:Camera}|null>(null);
 const cameraRef=useRef(camera);cameraRef.current=camera;
 const load=useCallback(async()=>{try{const r=await appFetch("/api/monitoring",{cache:"no-store"}),v=await r.json() as Monitoring&{error?:string};if(!r.ok)throw Error(v.error||"数据读取失败");setData(v);setError("");}catch(e){setError(e instanceof Error?e.message:"数据读取失败");}},[]);
 useEffect(()=>{load();const t=setInterval(load,15000);const visible=()=>{if(!document.hidden)load();};document.addEventListener("visibilitychange",visible);return()=>{clearInterval(t);document.removeEventListener("visibilitychange",visible);};},[load]);
 useLayoutEffect(()=>{const e=stage.current;if(!e)return;const measure=()=>{const s={w:e.clientWidth,h:e.clientHeight};setSize(s);if(!initialized.current&&s.w&&s.h){setCamera(fitRect(activeBounds,s.w,s.h-80,20));initialized.current=true;}};measure();const ro=new ResizeObserver(measure);ro.observe(e);return()=>ro.disconnect();},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(admin)return;if((e.target as Element)?.closest("input,textarea,select"))return;if(e.code==="Space"){space.current=e.type==="keydown";e.preventDefault();}if(e.key==="Escape"&&!admin){setSelection(null);setPanel(null);}};window.addEventListener("keydown",key);window.addEventListener("keyup",key);return()=>{window.removeEventListener("keydown",key);window.removeEventListener("keyup",key);};},[admin]);
 useEffect(()=>{const e=stage.current;if(!e)return;const wheel=(event:WheelEvent)=>{if((event.target as Element).closest(".floating-detail,.canvas-index,.board-toolbar"))return;event.preventDefault();const r=e.getBoundingClientRect();setCamera(c=>zoomAt(c,{x:event.clientX-r.left,y:event.clientY-r.top},c.k*Math.exp(-event.deltaY*.0015)));};e.addEventListener("wheel",wheel,{passive:false});return()=>e.removeEventListener("wheel",wheel);},[]);
 const reset=(full=false)=>{setMapPos({x:0,y:0});setCamera(fitRect(full?{x:0,y:0,w:map.width,h:map.height}:activeBounds,size.w,size.h-80,20));setSelection(null);setPanel(null);};
 const open=(s:Selection)=>{
   const origin={x:mapPos.x+s.x,y:mapPos.y+s.y};
   const side=nearestSide(s.x,s.y,map.width,map.height,s.kind);
   const w=Math.min(s.kind==="section"?680:640,size.w-40),h=Math.min(s.kind==="section"?690:460,size.h-120);
   const vertical=side==="top"||side==="bottom";
   const distance=side==="top"?s.y:side==="bottom"?map.height-s.y:side==="left"?s.x:map.width-s.x;
   const room=(vertical?size.h-80:size.w)-(vertical?h:w)-62;
   const c=room>0&&distance*camera.k>room?zoomAt(camera,{x:camera.x+origin.x*camera.k,y:camera.y+origin.y*camera.k},Math.min(camera.k,room/distance)):camera;
   const pos=placePanel(origin,{...mapPos,w:map.width,h:map.height},side,w,h,c.k);
   const p={...pos,w,h};setSelection(s);setPanel(p);setCamera(panToReveal(c,p,origin,size.w,size.h-80));setIndexOpen(false);
 };
 const pointOpen=(p:Point)=>{setLayers(l=>({...l,[p.type]:true}));open({...p,kind:"point"});};
 const sectionOpen=(s:Section)=>{setLayers(l=>({...l,sections:true}));open({id:s.id,kind:"section",x:(s.a[0]+s.b[0])/2,y:(s.a[1]+s.b[1])/2});};
 const startDrag=(e:React.PointerEvent,mode:Drag["mode"])=>{if(e.button!==0&&e.button!==1)return;e.stopPropagation();drag.current={mode:space.current||e.button===1?"pan":mode,start:{x:e.clientX,y:e.clientY},camera,mapPos,panel,moved:false};e.currentTarget.setPointerCapture(e.pointerId);};
 const moveDrag=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.start.x,dy=e.clientY-d.start.y;if(Math.abs(dx)+Math.abs(dy)>3)d.moved=true;
   if(d.mode==="pan")setCamera({...d.camera,x:d.camera.x+dx,y:d.camera.y+dy});
   if(d.mode==="map")setMapPos({x:d.mapPos.x+dx/d.camera.k,y:d.mapPos.y+dy/d.camera.k});
   if(d.mode==="panel"&&d.panel)setPanel({...d.panel,x:d.panel.x+dx/d.camera.k,y:d.panel.y+dy/d.camera.k});
   if(d.mode==="resize"&&d.panel)setPanel({...d.panel,w:Math.max(330,Math.min(2200,d.panel.w+dx)),h:Math.max(310,Math.min(1800,d.panel.h+dy))});
 };
 const endDrag=()=>{setTimeout(()=>{drag.current=null;},0);};
 const touchStart=(e:React.PointerEvent)=>{
   if(e.pointerType!=="touch")return;
   const r=stage.current!.getBoundingClientRect();pointers.current.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top});
   if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},camera};drag.current=null;}
 };
 const touchMove=(e:React.PointerEvent)=>{
   if(!pointers.current.has(e.pointerId))return false;
   const r=stage.current!.getBoundingClientRect();pointers.current.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top});
   if(pinch.current&&pointers.current.size===2){const [a,b]=[...pointers.current.values()],p=pinch.current,center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},c=zoomAt(p.camera,p.center,p.camera.k*Math.hypot(a.x-b.x,a.y-b.y)/p.distance);setCamera({...c,x:c.x+center.x-p.center.x,y:c.y+center.y-p.center.y});return true;}return false;
 };
 const closestPointClick=(e:React.MouseEvent)=>{e.stopPropagation();if(drag.current?.moved)return;const r=stage.current!.getBoundingClientRect(),x=(e.clientX-r.left-camera.x)/camera.k-mapPos.x,y=(e.clientY-r.top-camera.y)/camera.k-mapPos.y;const ps=map.points.filter(p=>layers[p.type]).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));if(ps[0]&&Math.hypot(ps[0].x-x,ps[0].y-y)<28/camera.k)pointOpen(ps[0]);};
 const zoomPanel=(factor:number)=>setPanel(p=>p?{...p,w:Math.max(330,Math.min(2200,p.w*factor)),h:Math.max(310,Math.min(1800,p.h*factor))}:p);
 const source=selection?{x:camera.x+(mapPos.x+selection.x)*camera.k,y:camera.y+(mapPos.y+selection.y)*camera.k}:null;
 const panelScreen=panel?{x:camera.x+panel.x*camera.k,y:camera.y+panel.y*camera.k,w:panel.w,h:panel.h}:null;
 const connector=source&&panelScreen?{x:Math.max(panelScreen.x,Math.min(panelScreen.x+panelScreen.w,source.x)),y:Math.max(panelScreen.y,Math.min(panelScreen.y+panelScreen.h,source.y))}:null;
 bridge.current=message=>{if(message.type==="select-point"){const p=map.points.find(p=>p.id===message.id);if(p)pointOpen(p);}if(message.type==="select-section"){const s=map.sections.find(s=>s.id===message.id);if(s)sectionOpen(s);}if(message.type==="clear"){setSelection(null);setPanel(null);}if(message.type==="fit")reset();if(message.type==="refresh")load();};
 useEffect(()=>{const config=appConfig(),embedded=!!config.embedded||new URLSearchParams(location.search).get("embed")==="1";setEmbedded(embedded);setOffline(config.mode==="offline");if(!embedded||window.parent===window||location.protocol==="file:")return;const origin=config.parentOrigin||location.origin;const receive=(event:MessageEvent)=>{if(event.source!==window.parent||event.origin!==origin)return;const command=parseBridgeMessage(event.data);if(command)bridge.current(command);};window.addEventListener("message",receive);window.parent.postMessage({channel:BRIDGE_CHANNEL,version:1,type:"ready"},origin);return()=>window.removeEventListener("message",receive);},[]);
 useEffect(()=>{if(!embedded||window.parent===window||location.protocol==="file:")return;window.parent.postMessage({channel:BRIDGE_CHANNEL,version:1,type:"selection",kind:selection?.kind||null,id:selection?.id||null},appConfig().parentOrigin||location.origin);},[selection,embedded]);
 const selectedSection=selection?.kind==="section"?map.sections.find(s=>s.id===selection.id):null;
 const src=selectedSection&&data?.sections[selectedSection.id];
 const dates=data?Object.keys(data.records).sort():[];
 return <div className={"canvas-app "+(embedded?"embedded-app":"")}>
 <header className="system-bar"><a className="system-brand" href={appUrl("/")}><Droplets size={22}/><b>大运</b><span>地下水位监测</span></a><span className="system-observed">{offline?"离线副本 · ":""}观测截至 {dates.at(-1)?.replace("T"," ")||"—"}</span><nav>{!offline&&<a href={appUrl("/source")} title="开源代码"><Code2 size={17}/><span>源码</span></a>}{!offline&&appConfig().audience!=="viewer"&&<button onClick={()=>setAdmin(true)}><LockKeyhole size={16}/><span>管理</span></button>}</nav></header>
 <div className="infinite-board" ref={stage} onPointerDown={e=>{touchStart(e);if(pointers.current.size<2)startDrag(e,"pan");}} onPointerMove={e=>{if(!touchMove(e))moveDrag(e);}} onPointerUp={e=>{pointers.current.delete(e.pointerId);pinch.current=null;endDrag();}} onPointerCancel={e=>{pointers.current.delete(e.pointerId);pinch.current=null;drag.current=null;}} style={{backgroundPosition:camera.x+"px "+camera.y+"px",backgroundSize:Math.max(12,32*camera.k)+"px "+Math.max(12,32*camera.k)+"px"}}>
  <svg className="board-map" width={size.w} height={size.h} aria-label="可自由移动的大运平面图" onPointerDown={e=>{if((e.target as Element).closest("[role=button]"))e.stopPropagation();}}>
    <g transform={"translate("+camera.x+" "+camera.y+") scale("+camera.k+")"}><g transform={"translate("+mapPos.x+" "+mapPos.y+")"}>
    <image href={appUrl("/assets/plan.png")} width={map.width} height={map.height} onPointerDown={e=>{touchStart(e);if(pointers.current.size<2)startDrag(e,"map");}} className="movable-plan"/>
    {layers.sections&&map.sections.map(s=><g key={s.id} role="button" tabIndex={0} aria-label={s.label+"断面"} className="board-section" onClick={e=>{e.stopPropagation();sectionOpen(s);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();sectionOpen(s);}}}>
     <title>{s.label}断面 · 点击查看</title><line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} strokeWidth={selection?.kind==="section"&&selection.id===s.id?5:2.5} stroke={selection?.kind==="section"&&selection.id===s.id?"#1675ec":"#0bafe2"} vectorEffect="non-scaling-stroke"/><line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="transparent" strokeWidth={22} vectorEffect="non-scaling-stroke"/></g>)}
    {map.points.filter(p=>layers[p.type]).map(p=><g key={p.id} role="button" tabIndex={0} aria-label={p.id+"观测点"} className={"board-point "+(selection?.kind==="point"&&selection.id===p.id?"is-active":"")} onClick={closestPointClick} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pointOpen(p);}}}><title>{p.id}</title><circle cx={p.x} cy={p.y} r={22/camera.k} fill="transparent"/><circle className="board-point-halo" cx={p.x} cy={p.y} r={12/camera.k} fill="white" fillOpacity={.18} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke"/><circle cx={p.x} cy={p.y} r={7/camera.k} fill={p.type==="NSW"?"#df289c":"#15283f"} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke"/></g>)}
    {map.points.filter(p=>layers[p.type]).map(p=>{const box=labels[p.id];return box?<g key={"label-"+p.id} role="button" tabIndex={0} aria-label={p.id+"名称"} onClick={e=>{e.stopPropagation();pointOpen(p);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pointOpen(p);}}} className={"board-label "+(selection?.id===p.id?"is-active":"")}><title>{p.id} · 点击名称查看</title><rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} pointerEvents="fill" rx={4} fill="transparent" stroke="transparent" strokeWidth={2} vectorEffect="non-scaling-stroke"/></g>:null;})}
    </g></g>
  </svg>
  {source&&connector&&<svg className="board-connector" width={size.w} height={size.h} aria-hidden="true"><path d={"M"+source.x+","+source.y+" L"+connector.x+","+connector.y} stroke="#fff" strokeWidth={8} strokeLinecap="round" fill="none"/><path d={"M"+source.x+","+source.y+" L"+connector.x+","+connector.y} stroke="#b83a09" strokeWidth={4} strokeLinecap="round" fill="none"/><circle cx={source.x} cy={source.y} r={7} fill="#b83a09" stroke="#fff" strokeWidth={3}/><circle cx={connector.x} cy={connector.y} r={7} fill="#b83a09" stroke="#fff" strokeWidth={3}/></svg>}
  {selection&&panelScreen&&<aside className="floating-detail" aria-label={(selectedSection?.label||selection.id)+"详情"} style={{left:panelScreen.x,top:panelScreen.y,width:panelScreen.w,height:panelScreen.h}} onPointerDown={e=>e.stopPropagation()} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={()=>{drag.current=null;}}>
   <header className="floating-titlebar" onPointerDown={e=>{if(!(e.target as Element).closest("button,a"))startDrag(e,"panel");}}><Grip size={17}/><div><b>{selectedSection?selectedSection.label+" 断面":selection.id}</b><span>{selection.kind==="section"?"工程断面":selection.id.startsWith("NSW")?"新水位监测点":"水位监测点"}</span></div><div className="window-actions"><button onClick={()=>zoomPanel(1/1.15)} title="缩小窗口"><Minus size={17}/></button><button onClick={()=>zoomPanel(1.15)} title="放大窗口"><Plus size={17}/></button><button onClick={()=>{setSelection(null);setPanel(null);}} aria-label="关闭详情"><X size={18}/></button></div></header>
   <div className="floating-body">{!data?<div className="empty-detail">{error||"正在读取观测数据…"}</div>:selection.kind==="point"?<WaterChart key={selection.id} id={selection.id} data={data}/>:src?<SectionViewer key={selectedSection!.id} src={appUrl(src)} label={selectedSection!.label}/>:<div className="empty-detail"><Layers size={32}/><h3>暂无断面资料</h3><p>{selectedSection?.label} 断面</p></div>}</div>
   <button className="window-resize" onPointerDown={e=>startDrag(e,"resize")} aria-label="拖动调整窗口大小" title="拖动调整窗口大小"><Maximize2 size={15}/></button>
  </aside>}
  <div className="board-toolbar" onPointerDown={e=>e.stopPropagation()}>
   <Popover open={indexOpen} onOpenChange={setIndexOpen}><PopoverTrigger asChild><button className="index-trigger"><MapPin size={17}/><span>点位</span><ChevronDown size={13}/></button></PopoverTrigger><PopoverContent align="start" side="top" className="canvas-index">
   <Tabs defaultValue="SW"><TabsList className="index-tab-list"><TabsTrigger value="SW">SW</TabsTrigger><TabsTrigger value="NSW">NSW</TabsTrigger><TabsTrigger value="section">断面</TabsTrigger></TabsList>{(["SW","NSW"] as const).map(type=><TabsContent key={type} value={type}><div className="compact-index">{map.points.filter(p=>p.type===type).map(p=><button key={p.id} onClick={()=>pointOpen(p)}><i className={"point-dot "+p.type}/>{p.id}</button>)}</div></TabsContent>)}<TabsContent value="section"><div className="compact-index">{map.sections.map(s=><button key={s.id} onClick={()=>sectionOpen(s)}><i className="section-dash"/>{s.label}</button>)}</div></TabsContent></Tabs></PopoverContent></Popover>
   <div className="toolbar-divider"/>{(["SW","NSW","sections"] as const).map(k=><button key={k} className={"layer-button "+(!layers[k]?"is-muted":"")} aria-pressed={layers[k]} onClick={()=>setLayers(l=>({...l,[k]:!l[k]}))}>{k==="sections"?<i className="section-dash"/>:<i className={"point-dot "+k}/>}<span>{k==="sections"?"断面":k}</span></button>)}<div className="toolbar-divider"/>
   <button aria-label="缩小画布" onClick={()=>setCamera(c=>zoomAt(c,{x:size.w/2,y:size.h/2},c.k/1.2))}><Minus size={17}/></button><span className="camera-percent">{Math.round(camera.k*100)}%</span><button aria-label="放大画布" onClick={()=>setCamera(c=>zoomAt(c,{x:size.w/2,y:size.h/2},c.k*1.2))}><Plus size={17}/></button><div className="toolbar-divider"/><button onClick={()=>reset(false)} title="复位并显示全部交互范围"><Scan size={17}/><span>观测区域</span></button><button onClick={()=>reset(true)} className="full-plan"><span>全图</span></button>
  </div>
  <div className="board-instructions"><Move size={14}/><span>拖底图移动主图 · 拖窗口标题移动详情 · 空白处 / 空格＋拖动移动画布</span></div>
  {error&&<div className="board-error" role="alert">{error} {data?"当前保留最近一次读取的数据":""}<button onClick={load}>重试</button></div>}
 </div>
 </div>;
}
