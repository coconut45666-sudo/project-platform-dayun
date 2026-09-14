export const companyLabels=['业主单位','勘察单位','设计单位','施工单位','监理单位','安全顾问'];
export const initialProject={name:'大运综合体 · 结构安全顾问项目',fullName:'华润置地深圳公司大运G01046-0106宗地DY-01-05地块',location:'深圳市龙岗区龙城街道',overview:'大运综合体5期商办项目，北临如意路，南临大运路，东临黄阁路。周边紧邻地铁16号线、深惠城际等轨道交通设施及市政道路。',companies:Object.fromEntries(companyLabels.map(x=>[x,''])),devices:[{id:'camera',name:'视觉设备',count:4},{id:'helmet',name:'智能安全帽',count:2},{id:'drone',name:'无人机',count:0},{id:'car',name:'无人车',count:0}],cameras:[] as {id:string;name:string;url:string;kind:'video'|'iframe'}[],progress:'',progressNote:''};
export const initialFolders={documents:['项目前期及现阶段最新地质勘察、水文地质资料','原基坑支护设计、计算书、施工图及历次变更资料','新基坑支护、补强、补桩、回填及支撑转换等设计资料','现有结构设计图纸、竣工图、计算书及检测鉴定','拆除方案及施工组织资料、结构模型及施工图','基坑降排水专项方案及相关计算资料','基坑、既有结构及周边环境监测方案','周边环境及涉轨资料'],simulation:['全流程模型','计算报告','工况分析','设计图纸'],reports:['日报','周报','月报','专项报告']};
export type Role='viewer'|'admin';
export type User={username:string;role:Role;displayName:string};
export function localDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());}
