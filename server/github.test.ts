import { describe, expect, it } from 'vitest'
import { metadataSchema, scoreMetadata, teamSchema, validateServiceMetadata } from './github.js'

const complete={
  apiVersion:'northstar.dev/v1',kind:'Service' as const,
  metadata:{name:'checkout-api',description:'Coordinates checkout and payments.'},
  spec:{owner:'team:checkout',lifecycle:'production' as const,tier:'critical',type:'backend',system:'commerce',language:'TypeScript',links:[{name:'Documentation',url:'https://docs.example.com/checkout'}]}
}

describe('service metadata',()=>{
  it('accepts the documented metadata contract',()=>expect(metadataSchema.parse(complete)).toEqual(complete))
  it('rejects missing ownership',()=>expect(()=>metadataSchema.parse({...complete,spec:{...complete.spec,owner:''}})).toThrow())
  it('accepts lifecycle strings for runtime configuration validation',()=>expect(metadataSchema.parse({...complete,spec:{...complete.spec,lifecycle:'staging'}}).spec.lifecycle).toBe('staging'))
  it('validates a service tier against catalog configuration',()=>{
    expect(validateServiceMetadata(complete).spec.tier).toBe('critical')
    expect(()=>validateServiceMetadata({...complete,spec:{...complete.spec,tier:'urgent'}})).toThrow('Unsupported tier: urgent')
  })
  it('keeps tier optional for existing service metadata',()=>{
    const {tier:_,...spec}=complete.spec
    expect(validateServiceMetadata({...complete,spec}).spec.tier).toBeUndefined()
  })
  it('validates a service type against catalog configuration',()=>{
    expect(validateServiceMetadata(complete).spec.type).toBe('backend')
    expect(()=>validateServiceMetadata({...complete,spec:{...complete.spec,type:'worker'}})).toThrow('Unsupported service type: worker')
  })
  it('keeps type optional for existing service metadata',()=>{
    const {type:_,...spec}=complete.spec
    expect(validateServiceMetadata({...complete,spec}).spec.type).toBeUndefined()
  })
  it('scores a complete service at 100',()=>expect(scoreMetadata(complete)).toBe(100))
  it('scores each missing recommended field independently',()=>{
    const sparse=metadataSchema.parse({...complete,metadata:{...complete.metadata,description:''},spec:{owner:'team:checkout',lifecycle:'production'}})
    expect(scoreMetadata(sparse)).toBe(40)
  })
})

describe('team metadata',()=>{
  it('accepts GitHub usernames as authoritative members',()=>{
    const team=teamSchema.parse({apiVersion:'northstar.dev/v1',kind:'Team',metadata:{name:'platform',title:'Platform',description:'Owns the portal.'},spec:{members:['octocat'],links:[{name:'Jira board',url:'https://jira.example.com/platform'}]}})
    expect(team.spec.members).toEqual(['octocat'])
    expect(team.spec.links[0].name).toBe('Jira board')
  })
  it('rejects an empty team name',()=>expect(()=>teamSchema.parse({apiVersion:'northstar.dev/v1',kind:'Team',metadata:{name:'',title:'Platform'},spec:{members:[]}})).toThrow())
})
