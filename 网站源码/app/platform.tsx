"use client";
import NewFileLibrary,{FileActions} from './file-library';
import ChangeHistory from './change-history';
import PlatformSettings,{SSOCallback,SSOButton} from './platform-settings';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Building2, MapPin, Camera, HardHat, Plane, Car, ArrowUpRight, Video, CalendarDays, Layers3, FolderOpen, Activity, LogOut, LockKeyhole, UserRound, Upload, ChevronLeft, ChevronRight, Download, Search, FileText, Plus, Save, Pencil, Expand, Archive, RotateCw, Folder, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { toast, Toaster } from 'sonner';
import { api, uploadFile, fileSize } from '@/lib/client';
import { companyLabels, localDate, type User } from '@/lib/defaults';
import Monitor from './monitor/monitor';
import MonitorAdmin from './monitor/admin/workspace';
import { exportCSV } from '@/lib/workbook-import';
import map from '@/data/map.json';
import ReportArchive from './report-archive';
import ReportCenter from './report-center';
import ToolDownload from './tool-download';
import './monitor/monitor.css';
const nav = [['首页', '/'], ['智能设备', '/devices'], ['数据监测', '/monitor'], ['数值模拟', '/simulation'], ['项目资料', '/documents'], ['报告中心', '/reports']];
export function Choice({ value, onChange, options, label }: {
    value: string;
    onChange: (s: string) => void;
    options: string[];
    label: string;
}) { return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{options.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>; }
export function Field({ label, children }: any) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Uploader({ scope, folders, onDone, label = '上传文件', category }: any) {
    const [open, setOpen] = useState(false), [files, setFiles] = useState<File[]>([]), [cat, setCat] = useState(category || folders?.[0] || '未分类'), [date, setDate] = useState(localDate()), [title, setTitle] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
    const accept = ['aerial', 'report-image'].includes(scope) ? 'image/png,image/jpeg,image/webp' : '.pdf,.doc,.docx,.dwg,.dxf,.xls,.xlsx,.csv,.txt,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp,.mp4,.ifc,.rvt,.stp,.step,.stl,.obj,.json';
    async function send(e: any) { e.preventDefault(); if (!files.length)
        return setError('请选择文件。'); setBusy(true); setError(''); const done: any[] = []; try {
        for (let i = 0; i < files.length; i++) {
            setProgress(`正在上传 ${i + 1}/${files.length}：${files[i].name}`);
            done.push(await uploadFile(files[i], { scope, category: cat, date, title: title || files[i].name, note }));
        }
        setFiles([]);
        setTitle('');
        setNote('');
        setOpen(false);
        toast.success('上传成功，文件已保存到平台；可在文件列表删除或从回收站恢复。');
        onDone?.(done);
    }
    catch (e: any) {
        setError(e.message);
        if (done.length) {
            setFiles(files.slice(done.length));
            onDone?.(done);
        }
    }
    finally {
        setBusy(false);
        setProgress('');
    } }
    return <><Button onClick={() => { setCat(category && (!folders || folders.includes(category)) ? category : folders?.[0] || '未分类'); setOpen(true); }}><Upload size={16}/>{label}</Button><Dialog open={open} onOpenChange={v => { if (!busy)
        setOpen(v); }}><DialogContent className="upload-dialog"><DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>文件保存在平台，展示账户可查看和下载。单文件最大90 MB。</DialogDescription></DialogHeader><form className="form-stack" onSubmit={send}><Field label="选择文件"><Input type="file" accept={accept} multiple onChange={e => setFiles(Array.from(e.target.files || []))}/></Field>{folders?.length > 0 && <Field label="文件分类"><Choice value={cat} onChange={setCat} options={folders} label="文件分类"/></Field>}<div className="form-grid"><Field label={scope === 'aerial' ? '拍摄日期' : '资料日期'}><Input required type="date" value={date} onChange={e => setDate(e.target.value)}/></Field><Field label="标题（留空使用文件名）"><Input value={title} maxLength={180} onChange={e => setTitle(e.target.value)}/></Field></div><Field label="备注"><Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000}/></Field>{files.length > 0 && <small>{files.map(x => x.name + ' · ' + fileSize(x.size)).join('；')}</small>}{error && <p className="error" role="alert">{error}</p>}{progress && <p role="status">{progress}</p>}<div className="inline-controls"><Button variant="outline" type="button" disabled={busy} onClick={()=>setOpen(false)}>取消上传</Button><Button type="submit" disabled={busy}>{busy ? '正在保存…' : '上传并保存'}</Button></div></form></DialogContent></Dialog></>;
}
function Login({ onLogin }: any) { const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); async function submit(e: any) { e.preventDefault(); setBusy(true); setError(''); try {
    await api('login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setPassword('');
    onLogin();
}
catch (e: any) {
    setError(e.message);
}
finally {
    setBusy(false);
} } return <div className="login-page"><div className="login-identity"><span className="brand-icon"><Building2 size={28}/></span><span className="eyebrow">DAYUN ENGINEERING</span><h1>大运工程<br />协同管理平台</h1><p>项目全景、监测数据与工程资料<br />在同一工作空间中有序协同。</p><div className="login-modules"><Activity />数据监测<Layers3 />数值模拟<FolderOpen />项目资料</div></div><section className="login-card"><LockKeyhole size={26}/><h2>登录工作空间</h2><SSOButton/><p>使用展示账户或管理账户登录</p><form onSubmit={submit} className="form-stack"><Field label="账号"><Input required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="请输入账号"/></Field><Field label="密码"><Input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码"/></Field>{error && <p className="error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? '正在登录…' : '登录平台'}<ArrowUpRight size={17}/></Button></form><small>展示账户可查看与下载，管理账户可维护数据。</small></section><footer>大运工程协同管理平台</footer></div>; }
export default function Platform() { const path = usePathname() || '/', [data, setData] = useState<any>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [needsLogin, setNeedsLogin] = useState(false); async function load() { setLoading(true); setError(''); try {
    const s = await api('bootstrap');
    setData(s);
    setNeedsLogin(false);
    if (location.pathname === '/login')
        location.replace('/');
}
catch (e: any) {
    if (e.message.includes('登录'))
        setNeedsLogin(true);
    else
        setError(e.message);
}
finally {
    setLoading(false);
} } useEffect(() => { load(); }, []); useEffect(() => { const ctx = (document as any).modelContext; if (!ctx?.registerTool || !data)
    return; const ctrl = new AbortController(); Promise.resolve(ctx.registerTool({ name: 'read_project_overview', title: '读取项目概况', description: '读取当前账号可见的项目概况和资料分类，不更改数据。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: any) => { if (input && Object.keys(input).length)
        throw Error('此工具不接受参数。'); const b = await api('bootstrap'); return { project: b.project, folders: b.folders, role: b.user.role }; } }, { signal: ctrl.signal })).catch(() => { }); return () => ctrl.abort(); }, [data]); if (path==='/sso/callback')return <SSOCallback/>;if (loading)
    return <div className="loading-page"><Building2 /><h1>大运G0104工程协同管理平台</h1><p>项目全景 · 数据监测 · 数值模拟 · 项目资料 · 报告中心</p><small>正在打开工作空间，项目内容需使用账户登录后查看。</small></div>; if (needsLogin)
    return <><Login onLogin={load}/><Toaster richColors/></>; if (error)
    return <div className="loading-page"><p className="error">{error}</p><Button onClick={load}>重新连接</Button></div>; const admin = data.user.role === 'admin'; return <main className="platform"><header className="topbar"><a className="brand" href="/"><span className="brand-icon"><Building2 /></span><span><b>大运工程</b><small>项目协同管理平台</small></span></a><nav>{nav.map(([s, h]) => <a className={(h === '/' ? path === '/' : path.startsWith(h)) ? 'active' : ''} href={h} key={h}>{s}</a>)}</nav>{admin&&<a className="settings-link" href="/settings">平台设置</a>}<span className={'role-badge ' + (admin ? 'admin-badge' : '')}><UserRound size={14}/>{data.user.displayName}</span><button className="logout" title="退出登录" onClick={async () => { window.dispatchEvent(new Event('dayun:logout')); await api('logout', { method: 'POST' }); location.href = '/login'; }}><LogOut size={17}/></button></header>{path === '/' ? <Dashboard data={data} reload={load}/> : path.startsWith('/reports/') ? <ReportArchive id={path.split('/')[2]}/> : path === '/settings' ? <PlatformSettings user={data.user}/> : path === '/aerial' ? <NewFileLibrary scope="aerial" data={data} reload={load}/> : path === '/monitor' ? <MonitorPage admin={admin}/> : path === '/devices' ? <DevicesPage data={data} reload={load}/> : path === '/reports' ? <ReportCenter data={data}/> : ['/simulation', '/documents'].includes(path) ? <NewFileLibrary scope={path === '/simulation' ? 'simulation' : path === '/documents' ? 'documents' : 'reports'} data={data} reload={load}/> : <div className="loading-page"><h1>页面不存在</h1><a href="/">返回首页</a></div>}<footer className="platform-footer"><span>大运工程协同管理平台</span><span>项目数据 · 集中管理 · 全程留存</span></footer><Toaster richColors position="bottom-right"/></main>; }
function ProjectEditor({ data, reload, label = '修改项目概况' }: any) { const [open, setOpen] = useState(false), [p, setP] = useState<any>(data.project), [busy, setBusy] = useState(false), [error, setError] = useState(''), [newLabel, setNewLabel] = useState(''); function edit(k: string, v: any) { setP({ ...p, [k]: v }); } async function save() { setBusy(true); setError(''); try {
    await api('project', { method: 'PUT', body: JSON.stringify({ value: p, revision: data.projectRevision }) });
    setOpen(false);
    toast.success('项目信息已更新。');
    reload();
}
catch (e: any) {
    setError(e.message);
}
finally {
    setBusy(false);
} } return <><Button size="sm" variant="outline" onClick={() => { setP(JSON.parse(JSON.stringify(data.project))); setOpen(true); }}><Pencil size={14}/>{label}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="wide-dialog"><DialogHeader><DialogTitle>项目及设备配置</DialogTitle><DialogDescription>保存后，展示账户将同步看到更新后的信息。</DialogDescription></DialogHeader><div className="form-stack scroll-form"><div className="form-grid"><Field label="项目名称"><Input value={p.name} onChange={e => edit('name', e.target.value)}/></Field><Field label="项目全称"><Input value={p.fullName} onChange={e => edit('fullName', e.target.value)}/></Field></div><Field label="项目位置"><Input value={p.location} onChange={e => edit('location', e.target.value)}/></Field><div className="form-grid">{Object.entries(p.companies).map(([k, v]) => <Field key={k} label={k}><Input value={String(v)} placeholder="待填写" onChange={e => edit('companies', { ...p.companies, [k]: e.target.value })}/><Button size="sm" variant="ghost" onClick={()=>{const n={...p.companies};delete n[k];edit("companies",n)}}>移除此单位</Button></Field>)}</div><div className="inline-controls"><Input placeholder="新增单位类型，如咨询单位" value={newLabel} onChange={e => setNewLabel(e.target.value)}/><Button variant="outline" onClick={() => { if (newLabel.trim() && !p.companies.hasOwnProperty(newLabel.trim())) {
    edit('companies', { ...p.companies, [newLabel.trim()]: '' });
    setNewLabel('');
} }}><Plus />增加单位</Button></div><Field label="工程概况"><Textarea rows={5} value={p.overview} onChange={e => edit('overview', e.target.value)}/></Field><div className="form-grid"><Field label="工程进度（%，可留空）"><Input type="number" min={0} max={100} value={p.progress} onChange={e => edit('progress', e.target.value)}/></Field><Field label="进度说明"><Input value={p.progressNote} onChange={e => edit('progressNote', e.target.value)}/></Field></div><h3>设备数量</h3><div className="form-grid">{p.devices.map((d: any, i: number) => <Field key={d.id} label={d.name}><Input type="number" min={0} value={d.count} onChange={e => edit('devices', p.devices.map((x: any, j: number) => j === i ? { ...x, count: Number(e.target.value) } : x))}/></Field>)}</div><h3>监控视频</h3><small>支持HTTPS MP4视频地址，或允许嵌入的监控网页。原平台鉴权视频未自动接入。</small>{p.cameras.map((c: any, i: number) => <div className="camera-editor" key={c.id}><Field label="监控名称"><Input value={c.name} onChange={e => edit('cameras', p.cameras.map((x: any, j: number) => i === j ? { ...x, name: e.target.value } : x))}/></Field><Field label="接入类型"><Choice value={c.kind === 'iframe' ? '监控网页' : '视频地址'} options={['视频地址', '监控网页']} label="接入类型" onChange={v => edit('cameras', p.cameras.map((x: any, j: number) => i === j ? { ...x, kind: v === '监控网页' ? 'iframe' : 'video' } : x))}/></Field><Field label="播放网址"><Input value={c.url} placeholder="https://" onChange={e => edit('cameras', p.cameras.map((x: any, j: number) => i === j ? { ...x, url: e.target.value } : x))}/></Field><Button variant="outline" onClick={() => edit('cameras', p.cameras.filter((_: any, j: number) => j !== i))}>移除此配置</Button></div>)}<Button variant="outline" onClick={() => edit('cameras', [...p.cameras, { id: crypto.randomUUID(), name: '新监控', url: '', kind: 'video' }])}><Plus />增加监控窗口</Button></div>{error && <p className="error" role="alert">{error}</p>}<div className="inline-controls"><Button variant="outline" onClick={()=>setOpen(false)}>取消修改</Button><ChangeHistory target="project" version={async()=>(await api("bootstrap")).projectRevision} onDone={()=>{setOpen(false);reload()}}/><Button disabled={busy} onClick={save}><Save />{busy ? '正在保存…' : '保存修改'}</Button></div></DialogContent></Dialog></>; }
function VideoPanel({ cameras = [] }: any) { const [index, setIndex] = useState('0'); const c = cameras[Number(index)] || cameras[0]; return <section className="panel video-panel"><div className="panel-title"><h2><Video />视频监控</h2>{cameras.length > 0 && <Choice value={c?.name || ''} onChange={name => setIndex(String(cameras.findIndex((x: any) => x.name === name)))} options={cameras.map((x: any) => x.name)} label="监控通道"/>}</div>{!c ? <div className="video-empty"><Video size={32}/><p>等待接入监控</p><small>管理账户可配置视频地址</small></div> : <div className="video-live">{c.kind === 'iframe' ? <iframe src={c.url} title={c.name} allow="fullscreen" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation"/> : <video src={c.url} controls playsInline onError={() => toast.error('视频地址无法播放，请由管理人员检查接入配置。')}/>}<a href={c.url} target="_blank" rel="noreferrer">在新窗口打开监控 <ArrowUpRight size={13}/></a></div>}</section>; }
function DeviceCards({ devices }: any) { const icons: any = { camera: Camera, helmet: HardHat, drone: Plane, car: Car }; return <div className="device-grid">{devices.map((d: any) => { const Icon = icons[d.id] || Camera; return <div className="device" key={d.id}><Icon /><span>{d.name}<b>{d.count}<small> 个</small></b></span></div>; })}</div>; }
function Dashboard({ data, reload }: any) { const p = data.project, admin = data.user.role === 'admin', [photos, setPhotos] = useState<any[]>([]), [index, setIndex] = useState(0), [full, setFull] = useState(false), start = useRef<number>(0); const loadPhotos = () => api('files?scope=aerial').then(b => { setPhotos(b.files); setIndex(0); }).catch(e => toast.error(e.message)); useEffect(() => { loadPhotos(); }, []); const photo = photos[index], src = photo ? '/api/files/' + photo.id : '/api/assets/aerial-reference.jpg'; function step(n: number) { setIndex(i => Math.max(0, Math.min(photos.length - 1, i + n))); } return <><div className="project-heading"><div><span className="eyebrow">项目总览 / PROJECT OVERVIEW</span><h1>{p.name}</h1><p>{p.fullName}</p></div>{admin ? <ProjectEditor data={data} reload={reload}/> : <span className="project-tag">{p.location}</span>}</div><div className="dashboard-grid"><aside className="left-column"><section className="panel"><div className="panel-title"><h2><Building2 />项目概况</h2><span>01</span></div><div className="location"><MapPin /><div><small>项目位置</small><p>{p.location || '待添加'}</p></div></div><div className="company-grid">{Object.entries(p.companies).map(([k, v]) => <div key={k}><small>{k}</small><p>{String(v) || '待添加'}</p></div>)}</div><div className="overview"><small>工程概况</small><p>{p.overview || '待添加'}</p>{p.progress !== '' && <div className="project-progress"><span>工程进度 {p.progress}%</span><div><i style={{ width: p.progress + '%' }}/></div><small>{p.progressNote}</small></div>}</div></section><section className="panel"><div className="panel-title"><h2><Camera />设备列表</h2><span>02</span></div><DeviceCards devices={p.devices}/></section><VideoPanel cameras={p.cameras}/></aside><section className="aerial-panel" onTouchStart={e => start.current = e.touches[0].clientX} onTouchEnd={e => { const d = e.changedTouches[0].clientX - start.current; if (Math.abs(d) > 45)
    step(d < 0 ? 1 : -1); }}><img className="aerial-image" src={src} alt={photo?.title || '项目航拍参考底图'}/><div className="aerial-top"><span><Camera size={16}/>项目现场 · 航拍档案</span><button className="glass-tag" onClick={() => setFull(true)} aria-label="放大航拍图"><Expand size={17}/></button></div>{photos.length > 1 && <div className="aerial-arrows"><button disabled={index === photos.length - 1} onClick={() => step(1)} aria-label="查看更早航拍"><ChevronLeft /></button><button disabled={index === 0} onClick={() => step(-1)} aria-label="查看较新航拍"><ChevronRight /></button></div>}<div className="aerial-bottom"><span className="eyebrow">每日记录 · 见证工程进展</span><h2>{photo?.date || '项目全景'}</h2><p>{photo?.title || '参考底图 · 拍摄日期待确认'}</p>{photo?.note && <p>{photo.note}</p>}<div className="photo-strip">{photos.slice(Math.max(0, index - 2), Math.max(5, index + 3)).map(x => <button key={x.id} className={x.id === photo?.id ? 'selected' : ''} onClick={() => setIndex(photos.findIndex(a => a.id === x.id))}><img src={'/api/files/' + x.id} alt={x.date}/><span>{x.date}</span></button>)}</div><div className="aerial-actions">{admin && <><Uploader label="上传每日航拍" scope="aerial" category="现场航拍" onDone={loadPhotos}/><a className="glass-tag" href="/aerial">管理航拍 / 回收站</a>{photo&&<FileActions file={photo} onDone={loadPhotos}/>}</>}<span>{photos.length ? `${index + 1} / ${photos.length} 张航拍` : '等待上传每日航拍'}</span>{photo && <a href={'/api/files/' + photo.id + '?download=1'}><Download size={17}/></a>}</div></div></section><aside className="right-column">{[['数据监测', 'SW / NSW · 水位与断面', '/monitor', 'plan.png', Activity], ['全流程数值模拟', '模型资料 · 计算成果', '/simulation', 'model.png', Layers3], ['项目资料库', '分类归档 · 查看与下载', '/documents', 'folders.png', FolderOpen]].map(([title, sub, href, img, Icon]: any) => <a className="module-card" href={href} key={href}><div className="module-heading"><div><span className="module-kicker"><Icon size={16}/>{sub}</span><h2>{title}</h2></div><ArrowUpRight /></div><div className={'module-image ' + (img === 'plan.png' ? 'plan-thumb' : '')}><img src={'/api/assets/' + img} alt={title}/></div><div className="module-footer"><span>进入{title === '数据监测' ? '监测看板' : title === '项目资料库' ? '资料库' : '模拟档案'}</span><ArrowUpRight size={16}/></div></a>)}</aside></div><Dialog open={full} onOpenChange={setFull}><DialogContent className="photo-dialog"><DialogHeader><DialogTitle>{photo?.date || '参考底图'} · {photo?.title || '项目全景'}</DialogTitle><DialogDescription>{photo?.note || '左右切换查看往日航拍'}</DialogDescription></DialogHeader><img src={src} alt={photo?.title || '项目全景'}/><div className="inline-controls"><Button variant="outline" disabled={index === photos.length - 1 || !photos.length} onClick={() => step(1)}><ChevronLeft />更早</Button><span>{photos.length ? index + 1 + ' / ' + photos.length : '拍摄日期待确认'}</span><Button variant="outline" disabled={!index} onClick={() => step(-1)}>较新<ChevronRight /></Button></div></DialogContent></Dialog></>; }
function DevicesPage({ data, reload }: any) { return <div className="page-content"><div className="page-heading"><div><span className="eyebrow">SMART DEVICES</span><h1>智能设备</h1><p>项目设备与视频监控</p></div>{data.user.role === 'admin' && <ProjectEditor data={data} reload={reload} label="配置设备与视频"/>}</div><section className="panel"><DeviceCards devices={data.project.devices}/></section><div className="devices-video"><VideoPanel cameras={data.project.cameras}/></div></div>; }
function MonitorPage({ admin }: any) { const [view, setView] = useState('map'); return <div className="monitor-page"><div className="page-heading"><div><span className="eyebrow">MONITORING</span><h1>数据监测</h1><p>SW / NSW 水位观测与断面资料 · 数据沿用原始工程时间</p></div><Button variant="outline" onClick={async () => { try {
    const d = await api('monitoring');
    exportCSV(d.records, map.points.map(p => p.id));
}
catch (e: any) {
    toast.error(e.message);
} }}><Download />下载监测数据</Button></div><Tabs value={view} onValueChange={setView}><div className="monitor-tabs"><TabsList><TabsTrigger value="map">俯瞰图与数据展示</TabsTrigger>{admin && <TabsTrigger value="manage">修改后台数据</TabsTrigger>}</TabsList>{admin && <span>管理账户可在两个工具之间切换 · <ToolDownload filename="dayun-monitor-app-v7.zip" label="下载原监测工具包"/></span>}</div><TabsContent value="map"><div className="monitor-surface"><Monitor /></div></TabsContent>{admin && <TabsContent value="manage"><div className="monitor-surface"><MonitorAdmin /></div></TabsContent>}</Tabs></div>; }
