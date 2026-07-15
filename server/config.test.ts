import { describe, expect, it } from 'vitest'
import { activateConfig, assertAdministratorConfigured, configSections, defaults, evaluateRule, isAdminLogin, parseConfigDocuments, serializeSection, scoreWithConfig, validateConfig, validateSection } from './config.js'

describe('portal configuration',()=>{
  it('validates editable sections',()=>expect(validateSection('general',defaults.general)).toEqual(defaults.general))
  it('rejects invalid colors',()=>expect(()=>validateSection('general',{...defaults.general,accentColor:'purple'})).toThrow())
  it('validates tools with one or more destinations',()=>expect(validateSection('tools',defaults.tools)).toEqual(defaults.tools))
  it('rejects tools without a destination',()=>expect(()=>validateSection('tools',{items:[{id:'grafana',name:'Grafana',description:'Dashboards',iconUrl:'',destinations:[]}]})).toThrow())
  it('evaluates supported scorecard operators',()=>{
    const metadata={metadata:{description:'A complete service description'},spec:{owner:'team:platform',lifecycle:'production',links:[{name:'Documentation'}]}}
    expect(evaluateRule(metadata,{id:'a',title:'Owner',description:'',path:'spec.owner',operator:'present',weight:1,severity:'required',enabled:true})).toBe(true)
    expect(evaluateRule(metadata,{id:'b',title:'Lifecycle',description:'',path:'spec.lifecycle',operator:'oneOf',value:['production'],weight:1,severity:'required',enabled:true})).toBe(true)
    expect(evaluateRule(metadata,{id:'c',title:'Docs',description:'',path:'spec.links',operator:'contains',value:'documentation',weight:1,severity:'recommended',enabled:true})).toBe(true)
  })
  it('returns a complete score when no rules are enabled',()=>{
    const old=defaults.scorecards.rules.map(r=>r.enabled);defaults.scorecards.rules.forEach(r=>r.enabled=false)
    expect(scoreWithConfig({})).toBe(100);defaults.scorecards.rules.forEach((r,i)=>r.enabled=old[i])
  })
  it('scopes weighted rules to configured service tiers',()=>{
    const scoped={...defaults,scorecards:{rules:[
      {id:'owner',title:'Owner',description:'',path:'spec.owner',operator:'present' as const,weight:1,severity:'required' as const,enabled:true},
      {id:'runbook',title:'Runbook',description:'',path:'spec.runbook',operator:'present' as const,weight:1,severity:'required' as const,enabled:true,tiers:['critical']}
    ]}}
    activateConfig(scoped)
    expect(scoreWithConfig({spec:{owner:'team:platform',tier:'critical'}})).toBe(50)
    expect(scoreWithConfig({spec:{owner:'team:platform',tier:'low'}})).toBe(100)
    activateConfig(defaults)
  })
  it('rejects duplicate tiers and unknown scorecard tier scopes',()=>{
    expect(()=>validateConfig({...defaults,catalog:{...defaults.catalog,tiers:[defaults.catalog.tiers[0],defaults.catalog.tiers[0]]}})).toThrow('Duplicate tier id')
    expect(()=>validateConfig({...defaults,scorecards:{rules:[{...defaults.scorecards.rules[0],tiers:['urgent']}]}})).toThrow('Unknown tier')
  })
  it('loads older catalog documents without a tiers field',()=>{
    const legacy={...defaults.catalog} as any;delete legacy.tiers
    expect((validateSection('catalog',legacy) as typeof defaults.catalog).tiers).toEqual([])
  })
  it('round-trips all six strict section documents',()=>{
    const documents=Object.fromEntries(configSections.map(section=>[section,serializeSection(section,defaults[section])])) as any
    expect(parseConfigDocuments(documents)).toEqual(defaults)
    documents.general+='unexpected: true\n'
    expect(()=>parseConfigDocuments(documents)).toThrow('general.yaml')
  })
  it('serializes sections deterministically',()=>expect(serializeSection('tools',defaults.tools)).toBe(serializeSection('tools',defaults.tools)))
  it('resolves Git and break-glass administrators without an open-admin fallback',()=>{
    const previous=process.env.GITHUB_ADMIN_LOGINS;process.env.GITHUB_ADMIN_LOGINS='breakglass'
    expect(isAdminLogin('BREAKGLASS',defaults)).toBe(true)
    expect(isAdminLogin('member',defaults)).toBe(false)
    if(previous===undefined)delete process.env.GITHUB_ADMIN_LOGINS;else process.env.GITHUB_ADMIN_LOGINS=previous
  })
  it('requires at least one configured administrator',()=>{
    const previous=process.env.GITHUB_ADMIN_LOGINS;delete process.env.GITHUB_ADMIN_LOGINS
    expect(()=>assertAdministratorConfigured(defaults)).toThrow('at least one administrator')
    expect(()=>assertAdministratorConfigured({...defaults,access:{admins:['octocat']}})).not.toThrow()
    if(previous!==undefined)process.env.GITHUB_ADMIN_LOGINS=previous
  })
})
