import { expect, it } from 'vitest'
import { trackDrivers } from './track-drivers'
import { adaptFrame } from './adapter'
import { fixture } from './fixtures.test-support'
it('maps real points to demo-compatible lap distance, including zero and multiple laps', () => {
 const data=fixture(),rows=adaptFrame(data,null).rows
 expect(trackDrivers(rows,'reviewer').map(d=>[d.progress,d.highlight])).toEqual([[8/90,true],[0,false]])
 rows[0]!.points=225
 expect(trackDrivers(rows)[0]!.progress).toBe(2.5)
})
it('keeps tied drivers at equal distance, preserves identity on reordering, and follows replay points',()=>{
 const data=fixture();data.participants[1]!.points=8
 const rows=adaptFrame(data,null).rows,drivers=trackDrivers(rows)
 expect(drivers[0]!.progress).toBe(drivers[1]!.progress)
 expect(trackDrivers([...rows].reverse())[1]!.color).toBe(drivers[0]!.color)
 expect(trackDrivers(adaptFrame(data,data.snapshots[0]!.sampledAt).rows).map(d=>d.progress)).toEqual([0])
})
