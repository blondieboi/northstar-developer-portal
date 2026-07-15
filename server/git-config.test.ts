import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaults, serializeSection, type ConfigSection } from './config.js'
import { commitSection, ConfigConflictError, configDirectoryChanged, configPushMatches, getConfigSource, initializeGitConfig, resetGitConfigForTests, setGitConfigOctokitFactoryForTests, syncGitConfig } from './git-config.js'

const saved={...process.env}
describe('Git configuration push routing',()=>{
  beforeEach(()=>{resetGitConfigForTests();process.env.NORTHSTAR_CONFIG_REPOSITORY='acme/portal-config';process.env.NORTHSTAR_CONFIG_BRANCH='main';process.env.NORTHSTAR_CONFIG_DIRECTORY='environments/production';process.env.NORTHSTAR_CONFIG_INSTALLATION_ID='42';process.env.GITHUB_ADMIN_LOGINS='breakglass'})
  afterEach(()=>{resetGitConfigForTests();for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)})
  it('matches only the configured repository and branch',()=>{
    expect(configPushMatches({repository:{full_name:'acme/portal-config'},ref:'refs/heads/main'})).toBe(true)
    expect(configPushMatches({repository:{full_name:'acme/portal-config'},ref:'refs/heads/release'})).toBe(false)
  })
  it('detects changes anywhere below the configured directory',()=>{
    expect(configDirectoryChanged({commits:[{added:[],modified:['environments/production/tools.yaml'],removed:[]}]})).toBe(true)
    expect(configDirectoryChanged({commits:[{added:[],modified:['environments/staging/tools.yaml'],removed:[]}]})).toBe(false)
  })
  it('applies a complete revision, retains it for an invalid revision, and recovers',async()=>{
    let head='good';const applied:string[]=[]
    const request=vi.fn(async(route:string,params:any)=>{
      if(route.includes('/git/ref/'))return{data:{object:{sha:head}}}
      const section=String(params.path).split('/').pop()!.replace('.yaml','') as ConfigSection
      const value=head==='recovered'&&section==='general'?{...defaults.general,name:'Recovered portal'}:defaults[section]
      const raw=head==='bad'&&section==='general'?'apiVersion: northstar.dev/v1\ngeneral:\n  unexpected: true\n':serializeSection(section,value)
      return{data:{type:'file',sha:`${head}-${section}`,content:Buffer.from(raw).toString('base64')}}
    })
    setGitConfigOctokitFactoryForTests((async()=>({request})) as any)
    await initializeGitConfig(async changed=>{applied.push(changed.join(','))})
    expect(getConfigSource()).toMatchObject({status:'ready',appliedSha:'good'})
    head='bad';await expect(syncGitConfig('github:test','bad')).rejects.toThrow('general.yaml')
    expect(getConfigSource()).toMatchObject({status:'degraded',observedSha:'bad',appliedSha:'good'})
    head='recovered';await syncGitConfig('system:poll')
    expect(getConfigSource()).toMatchObject({status:'ready',appliedSha:'recovered'})
    expect(applied.length).toBe(2)
  })
  it('rejects a stale UI blob SHA before creating a commit',async()=>{
    const request=vi.fn(async(route:string,params:any)=>{
      if(route.includes('/git/ref/'))return{data:{object:{sha:'good'}}}
      const section=String(params.path).split('/').pop()!.replace('.yaml','') as ConfigSection
      if(params.ref==='main')return{data:{type:'file',sha:'remote-change',content:''}}
      return{data:{type:'file',sha:`good-${section}`,content:Buffer.from(serializeSection(section,defaults[section])).toString('base64')}}
    })
    setGitConfigOctokitFactoryForTests((async()=>({request})) as any);await initializeGitConfig(async()=>{})
    await expect(commitSection('general',defaults.general,'good-general',{login:'admin',id:1,name:'Admin'})).rejects.toBeInstanceOf(ConfigConflictError)
    expect(request.mock.calls.some(([route])=>String(route).startsWith('PUT'))).toBe(false)
  })
  it('loads legacy repositories without integrations.yaml and creates it on first save',async()=>{
    let created=false
    const request=vi.fn(async(route:string,params:any)=>{
      if(route.includes('/git/ref/'))return{data:{object:{sha:'legacy'}}}
      const section=String(params.path).split('/').pop()!.replace('.yaml','') as ConfigSection
      if(route.startsWith('PUT')){created=true;return{data:{commit:{sha:'with-integrations'}}}}
      if(section==='integrations'&&!created)throw Object.assign(new Error('Not found'),{status:404})
      return{data:{type:'file',sha:`${created?'with-integrations':'legacy'}-${section}`,content:Buffer.from(serializeSection(section,defaults[section])).toString('base64')}}
    })
    setGitConfigOctokitFactoryForTests((async()=>({request})) as any)
    await initializeGitConfig(async()=>{})
    expect(getConfigSource().files.integrations).toBeUndefined()
    await commitSection('integrations',defaults.integrations,undefined,{login:'admin',id:1,name:'Admin'})
    expect(created).toBe(true)
    expect(getConfigSource().files.integrations?.sha).toBe('with-integrations-integrations')
  })
})
