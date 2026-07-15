import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { metadataChanged, verifyWebhookSignature } from './webhook.js'

describe('GitHub webhooks',()=>{
  it('accepts only a matching sha256 signature',()=>{const raw=Buffer.from('{"zen":"ship it"}');const signature=`sha256=${createHmac('sha256','secret').update(raw).digest('hex')}`;expect(verifyWebhookSignature(raw,signature,'secret')).toBe(true);expect(verifyWebhookSignature(raw,signature,'wrong')).toBe(false)})
  it('detects configured metadata paths across changed file groups',()=>{const payload={commits:[{added:['README.md'],modified:['.portal/service.yaml'],removed:[]}]};expect(metadataChanged(payload,['.portal/service.yaml','.portal/team.yaml'])).toBe(true);expect(metadataChanged(payload,['catalog.yaml'])).toBe(false)})
})
