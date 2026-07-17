import { describe, expect, it } from 'vitest'
import { calculateScore, calculateScorecards, evidenceFreshness, ruleApplies, type ScorecardDefinition, type ScorecardRule } from './scorecards'

const pluginRule:ScorecardRule={id:'actions',title:'Actions pass',description:'',path:'runs.0.conclusion',operator:'equals',value:'success',weight:1,severity:'required',enabled:true,source:{kind:'plugin',plugin:'github-actions'}}

describe('plugin-backed and multiple scorecards',()=>{
  it('treats missing plugin data as not applicable',()=>{
    expect(ruleApplies({spec:{}},pluginRule,{})).toBe(false)
    expect(calculateScore({spec:{}},[pluginRule],{})).toBe(100)
  })
  it('evaluates plugin facts when the provider is available',()=>{
    const plugins={'github-actions':{runs:[{conclusion:'failure'}]}}
    expect(ruleApplies({spec:{}},pluginRule,plugins)).toBe(true)
    expect(calculateScore({spec:{}},[pluginRule],plugins)).toBe(0)
  })
  it('calculates independent named scorecards',()=>{
    const cards:ScorecardDefinition[]=[{id:'metadata',title:'Metadata',description:'',enabled:true,primary:true,rules:[]},{id:'delivery',title:'Delivery',description:'',enabled:true,primary:false,rules:[pluginRule]}]
    expect(calculateScorecards({},cards,{'github-actions':{runs:[{conclusion:'success'}]}})).toEqual({metadata:100,delivery:100})
  })
  it('applies non-primary scorecards only to configured risk levels',()=>{
    const cards:ScorecardDefinition[]=[
      {id:'metadata',title:'Metadata',description:'',enabled:true,primary:true,rules:[]},
      {id:'sensitive',title:'Sensitive apps',description:'',enabled:true,primary:false,risks:['high','critical'],rules:[]}
    ]
    const high={spec:{lifecycle:'production',risk:{exposure:'public',dataSensitivity:'confidential',authentication:'required'}}}
    const low={spec:{lifecycle:'experimental',risk:{exposure:'internal',dataSensitivity:'none',authentication:'required'}}}
    expect(calculateScorecards(high,cards)).toHaveProperty('sensitive')
    expect(calculateScorecards(low,cards)).not.toHaveProperty('sensitive')
  })
  it('fails age-bounded plugin checks when the last successful evidence is stale',()=>{
    const rule={...pluginRule,maxEvidenceAgeHours:24}
    const plugins={'github-actions':{runs:[{conclusion:'success'}]}}
    const stale={'github-actions':{status:'ready',observedAt:'2026-07-01T00:00:00Z'}}
    const fresh={'github-actions':{status:'ready',observedAt:new Date().toISOString()}}
    expect(evidenceFreshness(rule,stale).status).toBe('stale')
    expect(evidenceFreshness(rule,{}).status).toBe('unknown')
    expect(calculateScore({},[rule],plugins,stale)).toBe(0)
    expect(calculateScore({},[rule],plugins,{})).toBe(0)
    expect(calculateScore({},[rule],plugins,fresh)).toBe(100)
  })
})
