import { describe, expect, it } from 'vitest'
import { activateConfig, assertAdministratorConfigured, assertAuthenticationConfigured, configSections, defaults, evaluateRule, getAllowedOrganizations, getTrustedProxyHops, isAdminGithubId, missingPluginScorecards, parseConfigDocuments, serializeSection, scoreWithConfig, validateConfig, validateSection } from './config.js'

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
  it('provides the repository standards scorecard only when it is missing from an enabled plugin',()=>{
    const enabled=validateConfig({...defaults,integrations:{plugins:[{id:'github-repository-standards',enabled:true,config:{}}]}})
    const repositoryCard=missingPluginScorecards(enabled)[0]
    expect(repositoryCard?.rules).toHaveLength(8)
    expect(repositoryCard?.rules.every(rule=>rule.source?.kind==='plugin'&&rule.source.plugin==='github-repository-standards')).toBe(true)
    expect(missingPluginScorecards(defaults)).toEqual([])
    const custom={...repositoryCard,title:'Our repository policy',rules:[]}
    const customized=validateConfig({...enabled,scorecards:{cards:[...defaults.scorecards.cards,custom]}})
    expect(missingPluginScorecards(customized)).toEqual([])
    expect(customized.scorecards.cards.find(card=>card.id==='repository-standards')?.title).toBe('Our repository policy')
  })
  it('validates remediation guidance and optional automatic fix values',()=>{
    const configured={...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[{...defaults.scorecards.cards[0].rules[0],remediation:{guidance:'Assign the accountable team.',docsUrl:'https://docs.example.com/ownership',suggestedValue:'team:platform'}}]}]}}
    expect(validateConfig(configured).scorecards.cards[0].rules[0].remediation?.suggestedValue).toBe('team:platform')
    expect(()=>validateConfig({...configured,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[{...defaults.scorecards.cards[0].rules[0],remediation:{guidance:'',docsUrl:'not-a-url'}}]}]}})).toThrow()
  })
  it('validates risk-scoped cards and plugin evidence age',()=>{
    const secondary={id:'critical-readiness',title:'Critical readiness',description:'',enabled:true,primary:false,risks:['high','critical'] as const,rules:[]}
    expect(validateConfig({...defaults,scorecards:{cards:[defaults.scorecards.cards[0],secondary]}}).scorecards.cards[1].risks).toEqual(['high','critical'])
    expect(()=>validateConfig({...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],risks:['critical']} ]}})).toThrow('every risk level')
    expect(()=>validateConfig({...defaults,scorecards:{cards:[{...defaults.scorecards.cards[0],rules:[{...defaults.scorecards.cards[0].rules[0],maxEvidenceAgeHours:24}]}]}})).toThrow('only to plugin-backed')
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
    const previous=process.env.GITHUB_ADMIN_IDS;process.env.GITHUB_ADMIN_IDS='42'
    expect(isAdminGithubId(42,defaults)).toBe(true)
    expect(isAdminGithubId(43,defaults)).toBe(false)
    if(previous===undefined)delete process.env.GITHUB_ADMIN_IDS;else process.env.GITHUB_ADMIN_IDS=previous
  })
  it('requires at least one configured administrator',()=>{
    const previous=process.env.GITHUB_ADMIN_IDS;delete process.env.GITHUB_ADMIN_IDS
    expect(()=>assertAdministratorConfigured(defaults)).toThrow('at least one administrator')
    expect(()=>assertAdministratorConfigured({...defaults,access:{admins:[42]}})).not.toThrow()
    if(previous!==undefined)process.env.GITHUB_ADMIN_IDS=previous
  })
  it('parses one or many allowed organizations case-insensitively and rejects empty entries',()=>{
    expect([...getAllowedOrganizations('Acme,Platform-Partners')]).toEqual(['acme','platform-partners'])
    expect(()=>getAllowedOrganizations('')).toThrow('required')
    expect(()=>getAllowedOrganizations('acme,,partners')).toThrow('empty entries')
  })
  it('uses one trusted proxy hop in production and validates explicit overrides',()=>{
    const previousNodeEnv=process.env.NODE_ENV
    process.env.NODE_ENV='production'
    expect(getTrustedProxyHops()).toBe(1)
    expect(getTrustedProxyHops('2')).toBe(2)
    expect(getTrustedProxyHops('0')).toBe(false)
    expect(()=>getTrustedProxyHops('-1')).toThrow('integer from 0 to 10')
    if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv
  })
  it('requires numeric immutable administrator IDs',()=>{
    expect(validateSection('access',{admins:[42,900719]})).toEqual({admins:[42,900719]})
    expect(()=>validateSection('access',{admins:['octocat']})).toThrow()
    const previous=process.env.GITHUB_ADMIN_IDS;process.env.GITHUB_ADMIN_IDS='42,,43'
    expect(()=>isAdminGithubId(42,defaults)).toThrow('empty entries')
    if(previous===undefined)delete process.env.GITHUB_ADMIN_IDS;else process.env.GITHUB_ADMIN_IDS=previous
  })
  it('rejects non-web URL protocols',()=>{
    expect(()=>validateSection('tools',{items:[{id:'bad',name:'Bad',destinations:[{label:'Open',url:'javascript:alert(1)'}]}]})).toThrow('http and https')
  })
  it('validates the complete production authentication environment',()=>{
    const names=['NODE_ENV','DATABASE_URL','GITHUB_APP_ID','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','GITHUB_WEBHOOK_SECRET','GITHUB_PRIVATE_KEY','GITHUB_PRIVATE_KEY_PATH','GITHUB_ALLOWED_ORGANIZATIONS','PERONGEN_CONFIG_INSTALLATION_ID','PUBLIC_URL','APP_URL'] as const
    const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]))
    Object.assign(process.env,{NODE_ENV:'production',DATABASE_URL:'postgres://localhost/perongen',GITHUB_APP_ID:'1',GITHUB_CLIENT_ID:'client',GITHUB_CLIENT_SECRET:'secret',GITHUB_WEBHOOK_SECRET:'webhook',GITHUB_PRIVATE_KEY:'key',GITHUB_ALLOWED_ORGANIZATIONS:'acme,partners',PERONGEN_CONFIG_INSTALLATION_ID:'42',PUBLIC_URL:'https://portal.example.com',APP_URL:'https://portal.example.com/app'})
    expect(()=>assertAuthenticationConfigured()).not.toThrow()
    process.env.APP_URL='https://other.example.com'
    expect(()=>assertAuthenticationConfigured()).toThrow('same origin')
    process.env.APP_URL='http://portal.example.com'
    expect(()=>assertAuthenticationConfigured()).toThrow('HTTPS')
    for(const name of names){const value=previous[name];if(value===undefined)delete process.env[name];else process.env[name]=value}
  })
})
