import fs from 'node:fs';import path from 'node:path';
const base=process.argv[2],dir=process.argv[3]||'private-assets';
if(!base)throw Error('用法：node scripts/import-assets.mjs 平台网址 素材目录');
const account=JSON.parse(fs.readFileSync(path.join(dir,'accounts.json'),'utf8')).find(x=>x.role==='admin');
const res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Dayun-Client':'platform'},body:JSON.stringify(account)});if(!res.ok)throw Error('登录失败：'+res.status);
const headers={Cookie:res.headers.get('set-cookie').split(';')[0],'X-Dayun-Client':'platform'};
const response=await fetch(base+'/api/files?scope=system',{headers});if(!response.ok)throw Error('无法读取资源清单');const existing=(await response.json()).files;
const names=['aerial-reference.jpg','model.png','folders.png','plan.png','section-4.png','section-5.png','source.xlsx','report-template.docx','report-logo.png','DailyReport-Windows-x64.zip','dayun-monitor-app-v7.zip'];
for(const name of names){const file=path.join(dir,name);if(!fs.existsSync(file)||existing.some(x=>x.title===name)){console.log('跳过：'+name);continue;}const meta={scope:'system',category:'集成资源',name,title:name,date:new Date().toISOString().slice(0,10),note:name==='aerial-reference.jpg'?'参考底图，拍摄日期待确认':''};const r=await fetch(base+'/api/files/upload',{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','X-File-Meta':encodeURIComponent(JSON.stringify(meta))},body:fs.readFileSync(file)});if(!r.ok)throw Error(name+'：'+await r.text());console.log('已导入：'+name);}
await fetch(base+'/api/logout',{method:'POST',headers});
