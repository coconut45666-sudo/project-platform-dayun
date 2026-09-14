import {accountAPI} from './accounts';
import {ssoAPI} from './sso';
import { db, bucket, HttpError, requireUser, login, logout, json, readJSON, iso, audit } from './auth';
import { initialProject, initialFolders, type User } from './defaults';
import { mergeEdits, type Monitoring, type CellEdit } from './model';
import seed from '@/data/seed.json';
import map from '@/data/map.json';
import {reportAPI,publishedReport} from './report-api';
import {getSetting as setting,commitSetting,historyStatement,sectionVersion,changeHistoryAPI} from './change-history';
export async function monitoring(): Promise<Monitoring> { const state = await setting('monitor', seed.records); const sections: Record<string, string> = { '4': '/api/assets/section-4.png', '5': '/api/assets/section-5.png' }, versions: Record<string, string> = { '4': 'original', '5': 'original' }; const a = await db().prepare('SELECT id,object_key,archived FROM section_archives').all<{
    id: string;
    object_key: string; archived: number;
}>(); for (const x of a.results) {
    if(x.archived)delete sections[x.id];else sections[x.id] = '/api/sections/' + encodeURIComponent(x.id) + '?v=' + encodeURIComponent(x.object_key);
    versions[x.id] = sectionVersion(x,x.id);
} return { records: state.value, revision: state.revision, faulty: seed.faulty, source: seed.source, warnings: seed.warnings, sections, sectionVersions: versions }; }
const safeDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const mimeTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain', dwg: 'application/acad', dxf: 'application/dxf', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', mp4: 'video/mp4', ifc: 'application/octet-stream', rvt: 'application/octet-stream', stp: 'application/octet-stream', step: 'application/octet-stream', stl: 'application/octet-stream', obj: 'application/octet-stream', json: 'application/json' };
async function streamFile(row: any, request: Request) { const obj = await bucket().get(row.object_key); if (!obj)
    throw new HttpError(404, '文件暂时不可用，请联系管理人员。'); const inline = new URL(request.url).searchParams.get('download') !== '1' && ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4'].includes(row.mime); return new Response(obj.body, { headers: { 'Content-Type': row.mime, 'Content-Length': String(obj.size), 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'", 'Cross-Origin-Resource-Policy': 'same-origin' } }); }
async function asset(name: string, r: Request) { const user = await requireUser(r); const row = await db().prepare("SELECT * FROM files WHERE scope='system' AND title=? AND archived=0 ORDER BY created_at DESC LIMIT 1").bind(name).first(); if (!row)
    throw new HttpError(404, '资料尚未导入。'); await canReadFile(row, user); return await streamFile(row, r); }
async function canReadFile(row: any, user: User) { if (!row || (row.archived && !(user.role === 'admin' && row.scope === 'report-image')))
    throw new HttpError(404, '文件不存在或已归档。'); if (user.role === 'viewer' && (row.scope === 'tool' || ['DailyReport-Windows-x64.zip', 'dayun-monitor-app-v7.zip'].includes(row.title) || ['DailyReport-Windows-x64.zip', 'dayun-monitor-app-v7.zip'].includes(row.name)))
    throw new HttpError(403, '此工具仅供管理账户使用。'); if (user.role === 'viewer' && row.scope === 'report-image') {
    const report = await db().prepare("SELECT * FROM reports WHERE id=? AND deleted_at IS NULL").bind(row.category).first<{
        payload: string;
    }>();
    if (!report)
        throw new HttpError(403, '此日报尚未发布。');
    const content=publishedReport(report);if(!content)throw new HttpError(403,'此日报尚未发布。');const p = JSON.parse(content);
    const images = [...(p.demolition?.images || []), ...(p.demolition?.issues || []).flatMap((x: any) => x.photos || []), ...(p.drainage?.images || []), ...(p.drainage?.monitoring || [])];
    if (!images.some((x: any) => x.id === row.id))
        throw new HttpError(403, '此图片尚未包含在已发布日报中。');
} }
async function upload(request: Request, user: User) { let meta: any; try {
    meta = JSON.parse(decodeURIComponent(request.headers.get('x-file-meta') || ''));
}
catch {
    throw new HttpError(400, '文件信息无效。');
} const scopes = ['aerial', 'documents', 'simulation', 'reports', 'report-image', 'tool', 'system']; if(meta.scope==='report-image')throw new HttpError(410,'在线填报已移除，请直接上传报告文件。'); if (!scopes.includes(meta.scope))
    throw new HttpError(400, '文件分类无效。'); const name = String(meta.name || '').replace(/[\x00-\x1f\/\\]/g, '_').slice(0, 180), ext = name.split('.').pop()?.toLowerCase() || ''; if (!mimeTypes[ext])
    throw new HttpError(400, '不支持此文件类型。'); if (['aerial', 'report-image'].includes(meta.scope) && !['png', 'jpg', 'jpeg', 'webp'].includes(ext))
    throw new HttpError(400, '请选择 PNG、JPEG 或 WebP 图片。'); const length = Number(request.headers.get('content-length')); if (!Number.isSafeInteger(length) || length <= 0 || length > 90 * 1024 * 1024)
    throw new HttpError(413, '单个文件须在0至90 MB之间。'); if (!safeDate(meta.date || ''))
    throw new HttpError(400, '请填写真实的文件日期。'); if (meta.scope === 'report-image' && !await db().prepare('SELECT id FROM reports WHERE id=? AND deleted_at IS NULL').bind(String(meta.category || '')).first())
    throw new HttpError(400, '请先保存日报再添加照片。'); const id = crypto.randomUUID(), key = 'uploads/' + id + '/' + name; await bucket().put(key, request.body, { httpMetadata: { contentType: mimeTypes[ext] } }); try {
    await db().prepare('INSERT INTO files(id,scope,category,title,name,object_key,mime,size,date,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, meta.scope, String(meta.category || '未分类').slice(0, 200), String(meta.title || name).slice(0, 200), name, key, mimeTypes[ext], length, meta.date, String(meta.note || '').slice(0, 2000), user.username, iso()).run();
}
catch (e) {
    await bucket().delete(key);
    throw e;
} await audit(user, '上传文件', id); return json({ id, revision:1, scope:meta.scope, category:meta.category, url: '/api/files/' + id, name, title: meta.title || name, date: meta.date }, 201); }
export async function handleAPI(request: Request) {
    try {
        const path = new URL(request.url).pathname.replace(/^\/api\//, ''), parts = path.split('/').map(decodeURIComponent), method = request.method;
        if(parts[0]==='auth'&&parts[1]==='config'&&method==='GET')return await ssoAPI(request,'config');
        if(parts[0]==='auth'&&parts[1]==='sso'&&method==='POST')return await ssoAPI(request,parts[2]);
        if (path === 'health')
            return json({ ok: true });
        if (path === 'login' && method === 'POST')
            return await login(request);
        if (path === 'logout' && method === 'POST')
            return await logout(request);
        const user = await requireUser(request, method !== 'GET');
        if(parts[0]==='ai')throw new HttpError(410,'网站内 AI 填报已移除。请在报告中心上传报告文件。');
        if(parts[0]==='accounts')return await accountAPI(request,user);
        if(parts[0]==='reports')return await reportAPI(request,parts,user);
        if(parts[0]==='changes')return await changeHistoryAPI(request,parts,user);
        if (path === 'session' && method === 'GET')
            return json({ user });
        if (path === 'bootstrap' && method === 'GET') {
            const [p, f] = await Promise.all([setting('project', initialProject), setting('folders', initialFolders)]);
            return json({ user, project: p.value, projectRevision: p.revision, folders: f.value, folderRevision: f.revision });
        }
        if (path === 'project' && method === 'PUT') {
            const b = await readJSON(request, 150000), p = b.value;
            if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200 || typeof p.companies !== 'object' || !Array.isArray(p.devices) || !Array.isArray(p.cameras))
                throw new HttpError(400, '项目信息格式不完整。');
            for (const v of Object.values(p.companies))
                if (typeof v !== 'string' || v.length > 200)
                    throw new HttpError(400, '单位名称格式无效。');
            for (const d of p.devices)
                if (!Number.isInteger(d.count) || d.count < 0 || d.count > 100000)
                    throw new HttpError(400, '设备数量须为非负整数。');
            for (const c of p.cameras) {
                let u: URL;
                try {
                    u = new URL(c.url);
                }
                catch {
                    throw new HttpError(400, '请输入完整的视频网址。');
                }
                if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
                    throw new HttpError(400, '视频地址须为HTTP/HTTPS，不支持嵌入账号密码。');
                if (!['video', 'iframe'].includes(c.kind))
                    throw new HttpError(400, '视频类型不正确。');
            }
            if (p.progress !== '' && (!Number.isFinite(Number(p.progress)) || Number(p.progress) < 0 || Number(p.progress) > 100))
                throw new HttpError(400, '工程进度须在0至100之间。');
            const revision = await commitSetting('project', p, b.revision,user,'修改项目及设备');
            await audit(user, '更新项目概况', 'project');
            return json({ revision });
        }
        if (path === 'folders' && method === 'PUT') {
            const b = await readJSON(request, 50000);
            for (const key of ['documents', 'simulation', 'reports'])
                if (!Array.isArray(b.value?.[key]) || b.value[key].some((x: any) => typeof x !== 'string' || !x.trim() || x.length > 200) || new Set(b.value[key]).size !== b.value[key].length)
                    throw new HttpError(400, '文件夹名称须有效且不能重复。');
            const old=await setting('folders',initialFolders);for(const scope of ['documents','simulation','reports']){for(const folder of old.value[scope].filter((x:string)=>!b.value[scope].includes(x))){const n=await db().prepare('SELECT COUNT(*) AS n FROM files WHERE scope=? AND category=?').bind(scope,folder).first<any>();if(n.n||scope==='reports'&&folder==='日报')throw new HttpError(409,'该分类仍有文件（含回收站）或为系统分类，不能删除。');}}return json({ revision: await commitSetting('folders', b.value, b.revision,user,'修改资料分类') });
        }
        if (path === 'monitoring' && method === 'GET')
            return json(await monitoring());
        if (path === 'monitoring' && method === 'POST') {
            const b = await readJSON(request), m = await monitoring();
            if (b.revision !== m.revision)
                throw new HttpError(409, '监测数据已有更新，请重新载入。');
            const next = mergeEdits(m.records, b.edits as CellEdit[], map.points.map(x => x.id));
            const revision = await commitSetting('monitor', next, b.revision,user,'更新或导入监测数据');
            await audit(user, '更新监测数据', String(revision));
            return json({ ...m, records: next, revision });
        }
        if(parts[0]==='sections'&&parts[1]){
            const id=parts[1];if(!map.sections.some(x=>x.id===id))throw new HttpError(404,'未找到断面。');
            const existing=await db().prepare('SELECT * FROM section_archives WHERE id=?').bind(id).first<any>();
            if(method==='GET'){if(existing?.archived)throw new HttpError(404,'此断面图已删除，可在修改记录中恢复。');if(!existing||existing.object_key.startsWith('original:'))return await asset('section-'+id+'.png',request);const o=await bucket().get(existing.object_key);if(!o)throw new HttpError(404,'断面图片不可用。');return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
            const version=sectionVersion(existing,id);let key=existing?.object_key||'original:'+id,archived=0,expected:any;
            if(method==='POST'){if(Number(request.headers.get('content-length'))>11*1024*1024)throw new HttpError(413,'图片须小于10 MB。');const form=await request.formData();expected=form.get('expectedVersion');const file=form.get('file');if(!(file instanceof File)||!file.size||file.size>10*1024*1024)throw new HttpError(400,'请选择小于10 MB的PNG或JPEG图片。');const bytes=new Uint8Array(await file.arrayBuffer()),png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(!png&&!jpg)throw new HttpError(400,'图片格式不正确。');if(expected!==version)throw new HttpError(409,'断面图片已有更新。');key='sections/'+id+'/'+crypto.randomUUID();await bucket().put(key,bytes,{httpMetadata:{contentType:png?'image/png':'image/jpeg'}});}
            else if(method==='PATCH'){const b=await readJSON(request);expected=b.expectedVersion;if(!['trash','restore'].includes(b.action))throw new HttpError(400,'操作无效。');archived=b.action==='trash'?1:0;}else throw new HttpError(404,'操作不存在。');
            if(expected!==version)throw new HttpError(409,'断面图片已有更新，请刷新。');const nextVersion=(archived?'deleted:':'')+key;
            const query=existing?db().prepare('UPDATE section_archives SET object_key=?,archived=?,created_at=? WHERE id=? AND object_key=? AND archived=? RETURNING id').bind(key,archived,iso(),id,existing.object_key,existing.archived):db().prepare('INSERT INTO section_archives(id,object_key,archived,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id').bind(id,key,archived,iso());
            const result=await db().batch([query,historyStatement('section',id,existing,nextVersion,archived?'删除断面图':method==='POST'?'上传断面图':'恢复断面图',user)]);if(!result[0].results.length){if(method==='POST')await bucket().delete(key);throw new HttpError(409,'断面图片已有更新。');}return json({url:archived?null:'/api/sections/'+encodeURIComponent(id)+'?v='+encodeURIComponent(key),version:nextVersion});
        }
        if (parts[0] === 'assets' && method === 'GET') {
            if (['DailyReport-Windows-x64.zip', 'dayun-monitor-app-v7.zip'].includes(parts[1]))
                await requireUser(request, true);
            return await asset(parts.slice(1).join('/'), request);
        }
        if (path === 'files/upload' && method === 'POST')
            return await upload(request, user);
        if(path==='files'&&method==='GET'){const u=new URL(request.url),scope=u.searchParams.get('scope')||'documents',archived=u.searchParams.get('archived')==='1'?1:0;if(user.role==='viewer'&&(archived||['tool','report-image','system'].includes(scope)))throw new HttpError(403,'无权查看此分类。');const rows=await db().prepare('SELECT id,scope,category,title,name,mime,size,date,note,revision,archived,created_by AS createdBy,created_at AS createdAt FROM files WHERE scope=? AND archived=? ORDER BY date DESC,created_at DESC LIMIT 2000').bind(scope,archived).all();return json({files:rows.results});}
        if(parts[0]==='files'&&parts[1]){const row=await db().prepare('SELECT * FROM files WHERE id=?').bind(parts[1]).first<any>();if(method==='GET'){await canReadFile(row,user);return await streamFile(row,request);}if(method==='PATCH'){if(!row)throw new HttpError(404,'文件不存在。');if(row.scope==='report-image')throw new HttpError(410,'旧版报告附件随存档保留，请在报告中心删除或恢复整份报告。');const b=await readJSON(request,10000);if(b.revision!==row.revision)throw new HttpError(409,'文件已有更新，请刷新后重试。');let next={...row};if(b.action==='trash'||b.archived===true){if(row.scope==='report-image'){const parent=await db().prepare('SELECT * FROM reports WHERE id=?').bind(row.category).first<any>();const published=parent&&publishedReport(parent);if(published){const p=JSON.parse(published);if([...(p.demolition.images||[]),...(p.demolition.issues||[]).flatMap((x:any)=>x.photos||[]),...(p.drainage.images||[]),...(p.drainage.monitoring||[])].some(x=>x.id===row.id))throw new HttpError(409,'此图片仍用于正式日报，请先撤回正式日报或发布不含此图的新版本。');}}next.archived=1;}else if(b.action==='restore'||b.archived===false)next.archived=0;else{if(b.date&&!safeDate(b.date))throw new HttpError(400,'日期无效。');next={...row,title:String(b.title??row.title).slice(0,200),category:String(b.category??row.category).slice(0,200),date:b.date||row.date,note:String(b.note??row.note).slice(0,2000)};}
        const revision=row.revision+1;const result=await db().batch([db().prepare('UPDATE files SET title=?,category=?,date=?,note=?,archived=?,revision=revision+1 WHERE id=? AND revision=? RETURNING revision').bind(next.title,next.category,next.date,next.note,next.archived,row.id,row.revision),historyStatement('file',row.id,row,revision,next.archived?'删除文件至回收站':row.archived?'恢复文件':'修改文件信息',user)]);if(!result[0].results.length)throw new HttpError(409,'文件已有更新。');return json({revision});}}
        throw new HttpError(404, '未找到该功能。');
    }
    catch (e) {
        if (!(e instanceof HttpError))
            console.error('Platform API:', e);
        return json({ error: e instanceof HttpError ? e.message : e instanceof Error ? e.message : '操作失败，请稍后重试。' }, e instanceof HttpError ? e.status : 400);
    }
}
