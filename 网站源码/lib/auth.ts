import { env } from 'cloudflare:workers';
import type { User } from './defaults';
export const db = () => { if (!env.DB)
    throw new HttpError(503, '数据服务暂时不可用，请稍后重试。'); return env.DB; };
export const bucket = () => { if (!env.BUCKET)
    throw new HttpError(503, '文件存储暂时不可用，请稍后重试。'); return env.BUCKET; };
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export const iso = () => new Date().toISOString();
export const hash = async (s: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('hex');
export async function passwordHash(p: string, salt: string) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveBits']); return Buffer.from(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(Buffer.from(salt, 'hex')), iterations: 100000, hash: 'SHA-256' }, k, 256)).toString('hex'); }
function constantEqual(a: string, b: string) { let n = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++)
    n |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return n === 0; }
export async function currentUser(request:Request):Promise<User|null>{const token=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('dayun_session='))?.slice(14);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const session=await db().prepare('SELECT username,role,display_name AS displayName FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token),Date.now()).first<User>();if(!session)return null;if((env as any).AUTH_MODE==='sso'&&!session.username.startsWith('sso:'))return null;if(session.username.startsWith('sso:'))return session;const account=await db().prepare('SELECT username,role,display_name AS displayName,disabled FROM accounts WHERE username=?').bind(session.username).first<any>();return account?account.disabled?null:{username:account.username,role:account.role,displayName:account.displayName}:null;}
export async function issueSession(request:Request,user:User,seconds=43200){const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');await db().prepare('INSERT INTO sessions(token_hash,username,role,display_name,expires_at) VALUES(?,?,?,?,?)').bind(await hash(token),user.username,user.role,user.displayName,Date.now()+seconds*1000).run();return Response.json({user},{headers:{'Set-Cookie':`dayun_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${new URL(request.url).protocol==='https:'?'; Secure':''}`,'Cache-Control':'no-store'}});}
export async function requireUser(request: Request, admin = false) { const u = await currentUser(request); if (!u)
    throw new HttpError(401, '请先登录平台。'); if (admin && u.role !== 'admin')
    throw new HttpError(403, '展示账户仅可查看与下载。此操作需要管理账户。'); if (request.method !== 'GET' && request.method !== 'HEAD')
    sameOrigin(request); return u; }
export function sameOrigin(r: Request) { const origin = r.headers.get('origin'); if (origin && origin !== new URL(r.url).origin)
    throw new HttpError(403, '请求来源不受信任。'); if (!origin && r.headers.get('x-dayun-client') !== 'platform')
    throw new HttpError(403, '缺少请求来源标识。'); }
export async function login(request: Request) { sameOrigin(request); const b = await readJSON(request, 4096); const username = String(b.username || '').trim().toLowerCase(), password = String(b.password || ''); if (username.length > 64 || password.length > 200)
    throw new HttpError(400, '账号或密码格式无效。'); const key = await hash(username + '|' + (request.headers.get('cf-connecting-ip') || 'local')); const now = Date.now(); const attempt = await db().prepare('INSERT INTO login_attempts(key,started,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET started=CASE WHEN started<? THEN excluded.started ELSE started END,attempts=CASE WHEN started<? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(key, now, now - 900000, now - 900000).first<{
    attempts: number;
}>(); if ((attempt?.attempts || 0) > 10)
    throw new HttpError(429, '尝试次数较多，请15分钟后再试。'); if((env as any).AUTH_MODE==='sso')throw new HttpError(403,'此项目使用统一登录。');await (await import('./accounts')).ensureAccounts();const user=await db().prepare('SELECT username,display_name AS displayName,role,salt,hash,disabled FROM accounts WHERE username=?').bind(username).first<any>(); const found = await passwordHash(password, user?.salt || '00'.repeat(16)); if (!user || user.disabled || !constantEqual(found, user.hash))
    throw new HttpError(401, '账号或密码不正确。'); const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'); await db().batch([db().prepare('INSERT INTO sessions(token_hash,username,role,display_name,expires_at) VALUES(?,?,?,?,?)').bind(await hash(token), user.username, user.role, user.displayName, now + 12 * 3600000), db().prepare('DELETE FROM login_attempts WHERE key=?').bind(key), db().prepare('DELETE FROM sessions WHERE expires_at<?').bind(now)]); return Response.json({ user: { username: user.username, role: user.role, displayName: user.displayName } }, { headers: { 'Set-Cookie': `dayun_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`, 'Cache-Control': 'no-store' } }); }
export async function logout(request: Request) { sameOrigin(request); const token = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('dayun_session='))?.slice(14); if (token)
    await db().prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run(); return Response.json({ ok: true }, { headers: { 'Set-Cookie': 'dayun_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0', 'Cache-Control': 'no-store' } }); }
export async function readJSON(r: Request, max = 4000000) { if (Number(r.headers.get('content-length')) > max)
    throw new HttpError(413, '本次提交内容过大。'); const raw = await r.text(); if (new TextEncoder().encode(raw).length > max)
    throw new HttpError(413, '本次提交内容过大。'); try {
    return JSON.parse(raw);
}
catch {
    throw new HttpError(400, '提交内容格式不正确。');
} }
export const json = (v: any, status = 200) => Response.json(v, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function audit(user: User, action: string, target: string) { await db().prepare('INSERT INTO audit(id,username,action,target,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), user.username, action, target, iso()).run(); }
