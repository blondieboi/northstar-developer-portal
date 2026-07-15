import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import YAML from 'yaml'
import { configSchema, configSections, defaults, serializeSection, type PortalConfig } from './config.js'
import { getConfigOverrides, listAdminLogins, migrate, pool } from './db.js'

const args=process.argv.slice(2);const outputArg=args.indexOf('--output');const output=outputArg>=0?args[outputArg+1]:undefined;const force=args.includes('--force')
if(!output)throw new Error('Usage: npm run config:export -- --output <directory> [--force]')

const merge=(base:any,next:any):any=>Array.isArray(next)?next:next&&typeof next==='object'?Object.fromEntries(Array.from(new Set([...Object.keys(base||{}),...Object.keys(next)])).map(key=>[key,merge(base?.[key],next[key])])):next===undefined?base:next
await migrate()
const legacyPath=process.env.NORTHSTAR_CONFIG_PATH||'./northstar.yaml';let raw:any={}
if(existsSync(legacyPath))raw=YAML.parse(await readFile(legacyPath,'utf8'))||{}
if(raw.access?.bootstrapAdmins&&!raw.access.admins)raw.access={admins:raw.access.bootstrapAdmins}
delete raw.access?.bootstrapAdmins
let aggregate:any=merge(defaults,raw)
for(const [section,value] of Object.entries(await getConfigOverrides())){
  const normalized=section==='access'&&value&&typeof value==='object'&&'bootstrapAdmins' in value?{admins:(value as any).bootstrapAdmins}:value
  aggregate={...aggregate,[section]:normalized}
}
const currentAdmins=await listAdminLogins();aggregate.access={admins:Array.from(new Set([...(aggregate.access?.admins||[]),...currentAdmins])).sort((a:string,b:string)=>a.localeCompare(b))}
const config=configSchema.parse(aggregate) as PortalConfig;const directory=resolve(output)
for(const section of configSections){const path=resolve(directory,`${section}.yaml`);if(existsSync(path)&&!force)throw new Error(`${path} already exists; use --force to replace generated files`)}
await mkdir(directory,{recursive:true})
for(const section of configSections)await writeFile(resolve(directory,`${section}.yaml`),serializeSection(section,config[section]),'utf8')
await pool?.end()
console.log(`Exported ${configSections.length} validated configuration files to ${directory}`)
