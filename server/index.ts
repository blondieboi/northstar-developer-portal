import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticFiles from '@fastify/static'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate, listServices } from './db.js'
import { dispatchWorkflow, syncInstallation } from './github.js'
import { beginLogin, currentUser, finishLogin, logout, requireAdmin } from './auth.js'

const server=Fastify({logger:true})
await server.register(cors,{origin:true})
await migrate()

server.get('/api/health',async()=>({status:'ok',database:Boolean(process.env.DATABASE_URL),github:Boolean(process.env.GITHUB_APP_ID)}))
server.get('/api/services',async()=>({services:(await listServices())||[]}))
server.get('/api/github/status',async()=>({configured:Boolean(process.env.GITHUB_APP_ID&&(process.env.GITHUB_PRIVATE_KEY||process.env.GITHUB_PRIVATE_KEY_PATH)),appId:process.env.GITHUB_APP_ID||null}))
server.get('/api/auth/login',async(_request,reply)=>beginLogin(reply))
server.get<{Querystring:{code?:string;state?:string}}>('/api/auth/callback',finishLogin)
server.get('/api/auth/me',async request=>({user:currentUser(request)}))
server.post('/api/auth/logout',async(_request,reply)=>logout(reply))
server.post<{Body:{installationId:number}}>('/api/github/sync',{preHandler:requireAdmin},async(request,reply)=>{
  if(!request.body?.installationId) return reply.code(400).send({error:'installationId is required'})
  const results=await syncInstallation(request.body.installationId)
  return {results,registered:results.filter(x=>x.status==='registered').length,unregistered:results.filter(x=>x.status==='unregistered').length}
})
server.post<{Body:{installationId?:number;repository?:string;workflow?:string;inputs?:Record<string,string>}}>('/api/actions/dispatch',{preHandler:requireAdmin},async(request,reply)=>{
  const {inputs={}}=request.body||{}
  const installationId=request.body?.installationId||Number(process.env.GITHUB_INSTALLATION_ID)
  const repository=request.body?.repository||process.env.ACTION_REPOSITORY||''
  const workflow=request.body?.workflow||process.env.ACTION_WORKFLOW||'create-service.yaml'
  if(!installationId||!repository||!workflow) return reply.code(400).send({error:'installationId, repository, and workflow are required'})
  await dispatchWorkflow(installationId,repository,workflow,inputs)
  return reply.code(202).send({status:'dispatched'})
})

const dist=resolve(process.cwd(),'dist')
if(existsSync(dist)){
  await server.register(staticFiles,{root:dist,wildcard:false})
  server.setNotFoundHandler((request,reply)=>request.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.sendFile('index.html'))
}

await server.listen({port:Number(process.env.PORT||4000),host:'0.0.0.0'})
