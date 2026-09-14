"use client";
import {useEffect,useRef,useState} from "react";
import {Minus,Plus,Scan,ArrowUpRight} from "lucide-react";
export default function SectionViewer({src,label}:{src:string;label:string}){
 const viewport=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState({w:1,h:1}),[natural,setNatural]=useState({w:1,h:1});
 const [zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0});
 const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
 useEffect(()=>{setZoom(1);setOffset({x:0,y:0});},[src]);
 useEffect(()=>{const e=viewport.current;if(!e)return;const ro=new ResizeObserver(()=>setSize({w:e.clientWidth,h:e.clientHeight}));ro.observe(e);return()=>ro.disconnect();},[]);
 const scale=Math.min((size.w-24)/natural.w,(size.h-24)/natural.h)*zoom;
 const reset=()=>{setZoom(1);setOffset({x:0,y:0});};
 return <div className="section-viewer"><div className="section-tools"><span>断面全图</span><button onClick={()=>setZoom(z=>Math.max(1,z/1.25))} aria-label="缩小断面"><Minus size={16}/></button><b>{Math.round(zoom*100)}%</b><button onClick={()=>setZoom(z=>Math.min(12,z*1.25))} aria-label="放大断面"><Plus size={16}/></button><button onClick={reset}><Scan size={16}/>适合窗口</button><a href={src} target="_blank" rel="noreferrer" download={src.startsWith("data:")?label+".png":undefined}>原图<ArrowUpRight size={15}/></a></div>
 <div className="section-stage" ref={viewport} onPointerDown={e=>{e.stopPropagation();drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)setOffset({x:drag.current.ox+e.clientX-drag.current.x,y:drag.current.oy+e.clientY-drag.current.y});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onWheel={e=>{e.stopPropagation();setZoom(z=>Math.max(1,Math.min(12,z*(e.deltaY<0?1.12:.89))));}}>
 <img src={src} alt={label+"断面全图"} draggable={false} onLoad={e=>{setNatural({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight});reset();}} style={{width:natural.w*Math.max(.001,scale),height:natural.h*Math.max(.001,scale),left:size.w/2+offset.x,top:size.h/2+offset.y,transform:"translate(-50%,-50%)"}}/></div><span className="section-tip">首次完整显示 · 滚轮放大 · 拖动查看细节</span></div>;
}

