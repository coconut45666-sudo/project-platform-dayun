import {db,json,HttpError,readJSON,iso,audit} from './auth';
import type {User} from './defaults';

// Legacy structured reports remain readable. New reports are ordinary uploaded files.
export function publishedReport(row:any){return row.deleted_at?null:row.published_payload||(row.status==='published'?row.payload:null)}
export async function reportAPI(request:Request,parts:string[],user:User){
 const method=request.method,id=parts[1],admin=user.role==='admin',url=new URL(request.url);
 if(method==='POST'||method==='PUT')throw new HttpError(410,'在线模板填报已移除，请在报告中心上传电脑中的报告文件。');
 if(!id){
  if(method!=='GET')throw new HttpError(405,'不支持此操作。');
  const status=url.searchParams.get('status')||'published';
  if(!['published','draft','trash','all'].includes(status))throw new HttpError(400,'报告筛选条件无效。');
  if(!admin&&status!=='published')throw new HttpError(403,'展示账户只能查看已发布报告。');
  const clause=status==='trash'?'deleted_at IS NOT NULL':status==='draft'?"deleted_at IS NULL AND status IN ('draft','revising')":status==='all'?'deleted_at IS NULL':"deleted_at IS NULL AND (published_payload IS NOT NULL OR status='published')";
  const rows=await db().prepare('SELECT * FROM reports WHERE '+clause+' ORDER BY date DESC,updated_at DESC LIMIT 2000').all<any>();
  return json({reports:rows.results.map(row=>{const r=JSON.parse(status==='published'?(publishedReport(row)||row.payload):row.payload);return {id:row.id,date:r.date,number:r.number,title:r.title,revision:row.revision,status:status==='published'?'published':row.status,hasPublished:!!(row.published_payload||row.status==='published'),deletedAt:row.deleted_at,updatedAt:row.updated_at}})});
 }
 const row=await db().prepare('SELECT * FROM reports WHERE id=?').bind(id).first<any>();
 if(!row)throw new HttpError(404,'报告存档不存在。');
 if(!admin&&(!publishedReport(row)||parts[2]))throw new HttpError(403,'此存档仅管理账户可访问。');
 if(method==='GET'){
  if(parts[2]==='history'){const rows=await db().prepare('SELECT revision,created_at AS createdAt,payload FROM report_history WHERE report_id=? ORDER BY revision DESC LIMIT 50').bind(id).all<any>();return json({history:rows.results.map(x=>({...x,report:JSON.parse(x.payload),payload:undefined}))})}
  if(parts[2])throw new HttpError(404,'操作不存在。');
  const published=!admin||url.searchParams.get('snapshot')==='published',source=published?publishedReport(row):row.payload;
  if(!source)throw new HttpError(403,'此报告尚未发布或已移入回收站。');
  return json({report:JSON.parse(source),revision:row.revision,status:published?'published':row.status,deletedAt:row.deleted_at,hasPublished:!!publishedReport(row)});
 }
 if(!admin)throw new HttpError(403,'仅管理账户可维护报告。');
 if(method!=='PATCH'||parts[2])throw new HttpError(405,'不支持此操作。');
 const b=await readJSON(request,5000);
 if(!['trash','restore'].includes(b.action))throw new HttpError(410,'在线编辑和发布已移除，请上传报告文件。');
 if(b.revision!==row.revision)throw new HttpError(409,'报告已有更新，请刷新。');
 const deletedAt=b.action==='trash'?iso():null;
 const result=await db().prepare('UPDATE reports SET deleted_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision').bind(deletedAt,iso(),id,row.revision).first<any>();
 if(!result)throw new HttpError(409,'报告已有更新，请刷新。');
 await audit(user,b.action==='trash'?'删除旧版报告至回收站':'恢复旧版报告',id);
 return json({revision:result.revision,status:row.status,deletedAt});
}
