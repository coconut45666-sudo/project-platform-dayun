export type XY={x:number;y:number};
export type Camera=XY&{k:number};
export type Rect=XY&{w:number;h:number};
export type Side="left"|"right"|"top"|"bottom";
export function fitRect(rect:Rect,w:number,h:number,padding=42):Camera {
 const k=Math.min((w-padding*2)/rect.w,(h-padding*2)/rect.h);
 return {k:Math.max(.08,Math.min(4,k)),x:w/2-(rect.x+rect.w/2)*k,y:h/2-(rect.y+rect.h/2)*k};
}
export function nearestSide(x:number,y:number,w:number,h:number,kind:"point"|"section"):Side {
 if(kind==="section")return x<w/2?"left":"right";
 return ([["left",x],["right",w-x],["top",y],["bottom",h-y]] as [Side,number][]).reduce((a,b)=>a[1]<=b[1]?a:b)[0];
}
export function placePanel(point:XY,map:Rect,side:Side,width:number,height:number,k:number,gap=30):XY {
 if(side==="left")return {x:map.x-(width+gap)/k,y:point.y-height/2/k};
 if(side==="right")return {x:map.x+map.w+gap/k,y:point.y-height/2/k};
 if(side==="top")return {x:point.x-width/2/k,y:map.y-(height+gap)/k};
 return {x:point.x-width/2/k,y:map.y+map.h+gap/k};
}
export function panToReveal(camera:Camera,panel:Rect,point:XY,w:number,h:number):Camera {
 const pr={x:panel.x*camera.k+camera.x,y:panel.y*camera.k+camera.y,w:panel.w,h:panel.h};
 const p={x:point.x*camera.k+camera.x,y:point.y*camera.k+camera.y};
 const axis=(start:number,length:number,p:number,total:number)=>{
   const lo=Math.min(start,p-20),hi=Math.max(start+length,p+20);
   if(hi-lo<=total-32)return Math.max(16-lo,Math.min(0,total-16-hi));
   return Math.max(16-start,Math.min(0,total-16-(start+length)));
 };
 return {...camera,x:camera.x+axis(pr.x,pr.w,p.x,w),y:camera.y+axis(pr.y,pr.h,p.y,h)};
}
export function zoomAt(c:Camera,screen:XY,k:number):Camera {
 const next=Math.max(.08,Math.min(6,k));
 return {k:next,x:screen.x-(screen.x-c.x)/c.k*next,y:screen.y-(screen.y-c.y)/c.k*next};
}

