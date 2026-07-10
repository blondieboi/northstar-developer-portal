import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

export type SessionUser={id:number;login:string;name:string;avatarUrl:string;role:'admin'|'member'}
const secret=()=>process.env.SESSION_SECRET||process.env.GITHUB_CLIENT_SECRET||'northstar-development-only'
const sign=(value:string)=>createHmac('sha256',secret()).update(value).digest('base64url')
const encode=(value:unknown)=>{const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return `${payload}.${sign(payload)}`}
const decode=<T>(value?:string):T|null=>{if(!value)return null;const [payload,signature]=value.split('.');if(!payload||!signature)return null;const expected=sign(payload);if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;try{return JSON.parse(Buffer.from(payload,'base64url').toString()) as T}catch{return null}}
const cookie=(request:FastifyRequest,name:string)=>request.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)
const cookieFlags=()=>`Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`

export function currentUser(request:FastifyRequest){return decode<SessionUser>(cookie(request,'northstar_session'))}
export function requireAdmin(request:FastifyRequest,reply:FastifyReply,done:()=>void){
  const user=currentUser(request)
  if(!user)return void reply.code(401).send({error:'Sign in with GitHub to continue'})
  if(user.role!=='admin')return void reply.code(403).send({error:'Administrator access is required'})
  done()
}

export function beginLogin(reply:FastifyReply){
  const clientId=process.env.GITHUB_CLIENT_ID
  if(!clientId)return reply.code(503).send({error:'GitHub OAuth is not configured'})
  const state=randomBytes(24).toString('base64url')
  reply.header('set-cookie',`northstar_oauth_state=${encode({state,created:Date.now()})}; ${cookieFlags()}`)
  const params=new URLSearchParams({client_id:clientId,state,redirect_uri:`${process.env.PUBLIC_URL||'http://localhost:4000'}/api/auth/callback`})
  return reply.redirect(`https://github.com/login/oauth/authorize?${params}`)
}

export async function finishLogin(request:FastifyRequest<{Querystring:{code?:string;state?:string}}>,reply:FastifyReply){
  const saved=decode<{state:string;created:number}>(cookie(request,'northstar_oauth_state'))
  const {code,state}=request.query
  if(!code||!state||!saved||saved.state!==state||Date.now()-saved.created>600_000)return reply.code(400).send({error:'OAuth state is invalid or expired'})
  const tokenResponse=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code})})
  const token=await tokenResponse.json() as {access_token?:string;error_description?:string}
  if(!token.access_token)return reply.code(401).send({error:token.error_description||'GitHub authorization failed'})
  const userResponse=await fetch('https://api.github.com/user',{headers:{authorization:`Bearer ${token.access_token}`,accept:'application/vnd.github+json','user-agent':'northstar-portal'}})
  const profile=await userResponse.json() as {id:number;login:string;name?:string|null;avatar_url:string}
  const admins=(process.env.GITHUB_ADMIN_LOGINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)
  const user:SessionUser={id:profile.id,login:profile.login,name:profile.name||profile.login,avatarUrl:profile.avatar_url,role:admins.length===0||admins.includes(profile.login.toLowerCase())?'admin':'member'}
  reply.header('set-cookie',`northstar_session=${encode(user)}; ${cookieFlags()}`)
  return reply.redirect('/')
}

export function logout(reply:FastifyReply){reply.header('set-cookie','northstar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');return {status:'signed_out'}}
