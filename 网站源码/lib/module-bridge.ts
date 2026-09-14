import map from "@/data/map.json";
export const BRIDGE_CHANNEL="dayun-groundwater";
export type BridgeCommand={channel:typeof BRIDGE_CHANNEL;version:1;type:"select-point"|"select-section"|"clear"|"fit"|"refresh";id?:string};
export function parseBridgeMessage(value:unknown):BridgeCommand|null{
 if(!value||typeof value!=="object")return null;const m=value as Record<string,unknown>;
 if(m.channel!==BRIDGE_CHANNEL||m.version!==1)return null;
 if(m.type==="select-point"&&typeof m.id==="string"&&map.points.some(p=>p.id===m.id))return {channel:BRIDGE_CHANNEL,version:1,type:m.type,id:m.id};
 if(m.type==="select-section"&&typeof m.id==="string"&&map.sections.some(s=>s.id===m.id))return {channel:BRIDGE_CHANNEL,version:1,type:m.type,id:m.id};
 if(m.type==="clear"||m.type==="fit"||m.type==="refresh")return {channel:BRIDGE_CHANNEL,version:1,type:m.type};
 return null;
}
