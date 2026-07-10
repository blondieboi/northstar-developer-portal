import { describe, expect, it } from 'vitest'
import { metadataSchema, scoreMetadata } from './github.js'

const complete={
  apiVersion:'northstar.dev/v1',kind:'Service' as const,
  metadata:{name:'checkout-api',description:'Coordinates checkout and payments.'},
  spec:{owner:'team:checkout',lifecycle:'production' as const,system:'commerce',language:'TypeScript',links:[{name:'Documentation',url:'https://docs.example.com/checkout'}]}
}

describe('service metadata',()=>{
  it('accepts the documented metadata contract',()=>expect(metadataSchema.parse(complete)).toEqual(complete))
  it('rejects missing ownership',()=>expect(()=>metadataSchema.parse({...complete,spec:{...complete.spec,owner:''}})).toThrow())
  it('rejects unknown lifecycle values',()=>expect(()=>metadataSchema.parse({...complete,spec:{...complete.spec,lifecycle:'staging'}})).toThrow())
  it('scores a complete service at 100',()=>expect(scoreMetadata(complete)).toBe(100))
  it('scores each missing recommended field independently',()=>{
    const sparse=metadataSchema.parse({...complete,metadata:{...complete.metadata,description:''},spec:{owner:'team:checkout',lifecycle:'production'}})
    expect(scoreMetadata(sparse)).toBe(40)
  })
})
