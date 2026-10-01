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
it('identifies the selected driver and suppresses labels at the same lap position', () => {
 const rows=adaptFrame(fixture(),null).rows
 rows[1]!.points=rows[0]!.points
 const first=trackDrivers(rows,'reviewer')
 expect(first[0]!.label).toBe('Real Reviewer')
 expect(first[1]!.label).toBeUndefined()
 const second=trackDrivers(rows,'zero')
 expect(second[1]!.label).toBe('New Driver')
 expect(second[0]!.label).toBeUndefined()
 rows[1]!.points+=90
 expect(trackDrivers(rows,'reviewer')[1]!.label).toBeUndefined()
})
it('shows one neutral group label for an unselected shared track position', () => {
 const rows=adaptFrame(fixture(),null).rows
 rows[1]!.points=rows[0]!.points
 expect(trackDrivers(rows).map(driver=>driver.label)).toEqual([undefined,'2 drivers'])
 expect(trackDrivers(rows,'zero').map(driver=>driver.label)).toEqual([undefined,'New Driver'])
})
