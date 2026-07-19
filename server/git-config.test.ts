import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configSections, defaults, serializeSection, type ConfigSection } from './config.js'
import { commitIntegrations, commitSection, ConfigConflictError, configDirectoryChanged, configPushMatches, getConfigSource, initializeGitConfig, previewConfigChange, resetGitConfigForTests, setGitConfigOctokitFactoryForTests, syncGitConfig } from './git-config.js'

const saved={...process.env}
describe('Git configuration push routing',()=>{
  beforeEach(()=>{resetGitConfigForTests();process.env.PERONGEN_CONFIG_REPOSITORY='acme/portal-config';process.env.PERONGEN_CONFIG_BRANCH='main';process.env.PERONGEN_CONFIG_DIRECTORY='environments/production';process.env.PERONGEN_CONFIG_INSTALLATION_ID='42';process.env.GITHUB_ADMIN_IDS='42'})
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
      const raw=head==='bad'&&section==='general'?'apiVersion: perongen.dev/v1\ngeneral:\n  unexpected: true\n':serializeSection(section,value)
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
  it('commits a plugin default scorecard before enabling its integration',async()=>{
    let revision=0
    const documents=Object.fromEntries(configSections.map(section=>[section,serializeSection(section,defaults[section])])) as Record<ConfigSection,string>
    const blobShas=Object.fromEntries(configSections.map(section=>[section,`base-${section}`])) as Record<ConfigSection,string>
    const writes:string[]=[]
    const blobs=new Map<string,string>()
    const request=vi.fn(async(route:string,params:any)=>{
      if(route.includes('/git/ref/'))return{data:{object:{sha:`revision-${revision}`}}}
      if(route.startsWith('GET /repos/{owner}/{repo}/git/commits'))return{data:{tree:{sha:`tree-${revision}`}}}
      if(route.startsWith('POST /repos/{owner}/{repo}/git/blobs')){const sha=`new-blob-${blobs.size}`;blobs.set(sha,params.content);return{data:{sha}}}
      if(route.startsWith('POST /repos/{owner}/{repo}/git/trees')){
        for(const entry of params.tree){const section=String(entry.path).split('/').pop()!.replace('.yaml','') as ConfigSection;documents[section]=blobs.get(entry.sha)!;blobShas[section]=entry.sha;writes.push(section)}
        return{data:{sha:'new-tree'}}
      }
      if(route.startsWith('POST /repos/{owner}/{repo}/git/commits'))return{data:{sha:'revision-1'}}
      if(route.startsWith('PATCH /repos/{owner}/{repo}/git/refs')){revision=1;return{data:{object:{sha:'revision-1'}}}}
      const section=String(params.path).split('/').pop()!.replace('.yaml','') as ConfigSection
      if(route.startsWith('PUT')){
        documents[section]=Buffer.from(params.content,'base64').toString('utf8');writes.push(section);revision+=1;blobShas[section]=`blob-${revision}-${section}`
        return{data:{commit:{sha:`revision-${revision}`}}}
      }
      return{data:{type:'file',sha:blobShas[section],content:Buffer.from(documents[section]).toString('base64')}}
    })
    setGitConfigOctokitFactoryForTests((async()=>({request})) as any)
    await initializeGitConfig(async()=>{})
    const preview=previewConfigChange('integrations',{plugins:[{id:'github-repository-standards',enabled:true,config:{}}]})
    expect(preview.sections.map(change=>change.section)).toEqual(['scorecards','integrations'])
    await commitIntegrations({plugins:[{id:'github-repository-standards',enabled:true,config:{}}]},'base-integrations',{login:'admin',id:1,name:'Admin'})
    expect(writes).toEqual(['scorecards','integrations'])
    expect(request.mock.calls.filter(([route])=>String(route).startsWith('POST /repos/{owner}/{repo}/git/commits'))).toHaveLength(1)
    expect(documents.scorecards).toContain('id: repository-standards')
    expect(documents.integrations).toContain('id: github-repository-standards')
  })
  it('backfills the scorecard without rewriting an already-enabled integration',async()=>{
    let revision=0
    const enabled={plugins:[{id:'github-repository-standards',enabled:true,config:{}}]}
    const documents=Object.fromEntries(configSections.map(section=>[section,serializeSection(section,section==='integrations'?enabled:defaults[section])])) as Record<ConfigSection,string>
    const blobShas=Object.fromEntries(configSections.map(section=>[section,`base-${section}`])) as Record<ConfigSection,string>
    const writes:string[]=[]
    const request=vi.fn(async(route:string,params:any)=>{
      if(route.includes('/git/ref/'))return{data:{object:{sha:`revision-${revision}`}}}
      const section=String(params.path).split('/').pop()!.replace('.yaml','') as ConfigSection
      if(route.startsWith('PUT')){documents[section]=Buffer.from(params.content,'base64').toString('utf8');writes.push(section);revision+=1;blobShas[section]=`blob-${revision}-${section}`;return{data:{commit:{sha:`revision-${revision}`}}}}
      return{data:{type:'file',sha:blobShas[section],content:Buffer.from(documents[section]).toString('base64')}}
    })
    setGitConfigOctokitFactoryForTests((async()=>({request})) as any)
    await initializeGitConfig(async()=>{})
    await commitIntegrations(enabled,'base-integrations',{login:'admin',id:1,name:'Admin'})
    expect(writes).toEqual(['scorecards'])
    expect(documents.scorecards).toContain('id: repository-standards')
  })
})
