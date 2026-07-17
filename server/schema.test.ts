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
    for(const table of ['teams','users','team_members','sync_runs','action_runs','config_state','config_sync_events','plugin_snapshots','service_score_history'])expect(db.public.getTable(table)).toBeTruthy()
    expect(Array.from(db.public.getTable('teams').getColumns()).some(column=>column.name==='links')).toBe(true)
    expect(Array.from(db.public.getTable('users').getColumns()).some(column=>column.name==='primary_team')).toBe(true)
    expect(Array.from(db.public.getTable('services').getColumns()).some(column=>column.name==='tier')).toBe(true)
    expect(Array.from(db.public.getTable('services').getColumns()).some(column=>column.name==='service_type')).toBe(true)
    expect(Array.from(db.public.getTable('services').getColumns()).some(column=>column.name==='scorecards')).toBe(true)
    expect(Array.from(db.public.getTable('sync_runs').getColumns()).some(column=>column.name==='results')).toBe(true)
  })
})
