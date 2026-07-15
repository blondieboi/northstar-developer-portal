import { describe, expect, it } from 'vitest'
import { calculateScore, calculateScorecards, ruleApplies, type ScorecardDefinition, type ScorecardRule } from './scorecards'

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
})
