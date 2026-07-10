import { describe, expect, it } from 'vitest'
import { newDb } from 'pg-mem'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

describe('database schema',()=>{
  it('migrates cleanly and enforces service uniqueness',async()=>{
    const db=newDb()
    const sql=await readFile(fileURLToPath(new URL('./schema.sql',import.meta.url)),'utf8')
    db.public.none(sql)
    db.public.none("insert into services(name,owner,repository) values ('checkout-api','checkout','acme/checkout-api')")
    expect(db.public.many('select name, owner from services')).toEqual([{name:'checkout-api',owner:'checkout'}])
    expect(()=>db.public.none("insert into services(name,owner,repository) values ('checkout-api','other','acme/other')")).toThrow()
  })

  it('stores teams, sync runs, and action runs',async()=>{
    const db=newDb()
    const sql=await readFile(fileURLToPath(new URL('./schema.sql',import.meta.url)),'utf8')
    db.public.none(sql)
    for(const table of ['teams','sync_runs','action_runs'])expect(db.public.getTable(table)).toBeTruthy()
  })
})
