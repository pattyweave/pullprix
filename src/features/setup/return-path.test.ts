import { describe, it, expect } from 'vitest'
import { safeSetupReturn } from './return-path'
describe('installation sign-in return', () => {
 it.each(['/teams/123','/installations/callback?installation_id=123'])('accepts only scoped internal destinations %s', value => expect(safeSetupReturn(value)).toBe(true))
 it.each(['https://evil.test','//evil.test','/teams/123?next=https://evil.test','/installations/callback?installation_id=123&next=evil',null,'/teams/0','/teams/../admin'])('rejects unsafe destination %s', value => expect(safeSetupReturn(value)).toBe(false))
})
