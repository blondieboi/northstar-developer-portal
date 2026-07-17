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
    const rules=defaults.scorecards.cards[0].rules;const old=rules.map(r=>r.enabled);rules.forEach(r=>r.enabled=false)
    expect(scoreWithConfig({})).toBe(100);rules.forEach((r,i)=>r.enabled=old[i])
  })
  it('scopes weighted rules to configured service tiers and types',()=>{
    const scoped={...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[
      {id:'owner',title:'Owner',description:'',path:'spec.owner',operator:'present' as const,weight:1,severity:'required' as const,enabled:true},
      {id:'runbook',title:'Runbook',description:'',path:'spec.runbook',operator:'present' as const,weight:1,severity:'required' as const,enabled:true,tiers:['critical'],types:['backend']}
    ]}]}}
    activateConfig(scoped)
    expect(scoreWithConfig({spec:{owner:'team:platform',tier:'critical',type:'backend'}})).toBe(50)
    expect(scoreWithConfig({spec:{owner:'team:platform',tier:'critical',type:'frontend'}})).toBe(100)
    expect(scoreWithConfig({spec:{owner:'team:platform',tier:'low',type:'backend'}})).toBe(100)
    activateConfig(defaults)
  })
  it('rejects duplicate tiers and unknown scorecard tier scopes',()=>{
    expect(()=>validateConfig({...defaults,catalog:{...defaults.catalog,tiers:[defaults.catalog.tiers[0],defaults.catalog.tiers[0]]}})).toThrow('Duplicate tier id')
    expect(()=>validateConfig({...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[{...defaults.scorecards.cards[0].rules[0],tiers:['urgent']}]}]}})).toThrow('Unknown tier')
  })
  it('rejects duplicate service types and unknown scorecard type scopes',()=>{
    expect(()=>validateConfig({...defaults,catalog:{...defaults.catalog,types:[defaults.catalog.types[0],defaults.catalog.types[0]]}})).toThrow('Duplicate service type id')
    expect(()=>validateConfig({...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[{...defaults.scorecards.cards[0].rules[0],types:['worker']}]}]}})).toThrow('Unknown service type')
  })
  it('migrates a legacy rules document into a primary scorecard',()=>{
    const legacy={rules:[defaults.scorecards.cards[0].rules[0]]}
    const parsed=validateSection('scorecards',legacy) as typeof defaults.scorecards
    expect(parsed.cards[0]).toMatchObject({id:'metadata-quality',primary:true})
  })
  it('loads cached configurations created before integrations existed',()=>{
    const legacy={...defaults} as any;delete legacy.integrations
    expect(validateConfig(legacy).integrations).toEqual({plugins:[]})
  })
  it('validates plugin configuration and plugin-backed scorecard sources',()=>{
    const configured={...defaults,integrations:{plugins:[{id:'github-actions',enabled:true,config:{lookbackDays:14,maximumRuns:10}}]}}
    expect(validateConfig(configured).integrations.plugins[0].id).toBe('github-actions')
    expect(()=>validateConfig({...configured,integrations:{plugins:[{id:'unknown',enabled:true,config:{}}]}})).toThrow('Unknown plugin')
    expect(()=>validateConfig({...configured,integrations:{plugins:[{id:'github-actions',enabled:true,config:{lookbackDays:0,maximumRuns:10}}]}})).toThrow()
    expect(()=>validateConfig({...configured,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[{...defaults.scorecards.cards[0].rules[0],source:{kind:'plugin',plugin:'unknown'}}]}]}})).toThrow('Unknown plugin')
  })
  it('validates remediation guidance and optional automatic fix values',()=>{
    const configured={...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[{...defaults.scorecards.cards[0].rules[0],remediation:{guidance:'Assign the accountable team.',docsUrl:'https://docs.example.com/ownership',suggestedValue:'team:platform'}}]}]}}
    expect(validateConfig(configured).scorecards.cards[0].rules[0].remediation?.suggestedValue).toBe('team:platform')
    expect(()=>validateConfig({...configured,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[{...defaults.scorecards.cards[0].rules[0],remediation:{guidance:'',docsUrl:'not-a-url'}}]}]}})).toThrow()
  })
  it('requires one primary card and unique scorecard ids',()=>{
    const second={...defaults.scorecards.cards[0],id:'delivery',title:'Delivery',primary:false,rules:[]}
    expect(validateConfig({...defaults,scorecards:{cards:[defaults.scorecards.cards[0],second]}}).scorecards.cards).toHaveLength(2)
    expect(()=>validateConfig({...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],primary:false},second]}})).toThrow('Exactly one scorecard')
    expect(()=>validateConfig({...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],enabled:false}]}})).toThrow('primary scorecard must be enabled')
    expect(()=>validateConfig({...defaults,scorecards:{cards:[defaults.scorecards.cards[0],{...second,id:defaults.scorecards.cards[0].id}]}})).toThrow('Duplicate scorecard')
  })
  it('loads older catalog documents without classification fields',()=>{
    const legacy={...defaults.catalog} as any;delete legacy.tiers;delete legacy.types
    expect((validateSection('catalog',legacy) as typeof defaults.catalog).tiers).toEqual([])
    expect((validateSection('catalog',legacy) as typeof defaults.catalog).types).toEqual([])
  })
  it('round-trips all seven strict section documents',()=>{
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
