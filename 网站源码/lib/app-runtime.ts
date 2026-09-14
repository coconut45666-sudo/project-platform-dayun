export type AppConfiguration={embedded?:boolean;audience?:'viewer'|'admin'|'local-admin';mode?:string;parentOrigin?:string;[key:string]:unknown};
export function appConfig():AppConfiguration{return {embedded:true,audience:'viewer'};}
export function appUrl(path:string):string{return path.startsWith('/assets/')?'/api/assets/'+path.slice(8):path;}
export async function appFetch(path:string,init?:RequestInit){return fetch(appUrl(path),{credentials:'same-origin',...init});}
