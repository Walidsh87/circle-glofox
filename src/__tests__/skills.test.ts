import { beltRank, overallBelt, BELTS, SKILLS } from '@/lib/skills'

test('BELTS is white → black, 8 levels', () => {
  expect(BELTS[0]).toBe('white')
  expect(BELTS[BELTS.length - 1]).toBe('black')
})
test('SKILLS are non-empty and grouped', () => {
  expect(SKILLS.length).toBeGreaterThan(8)
  expect(new Set(SKILLS.map((s) => s.category)).size).toBeGreaterThan(1)
})
describe('beltRank', () => {
  test('ordered', () => expect(beltRank('white')).toBeLessThan(beltRank('black')))
  test('unknown → -1', () => expect(beltRank('zzz')).toBe(-1))
})
describe('overallBelt', () => {
  test('lowest assessed wins', () => expect(overallBelt({ pullup: 'blue', snatch: 'white' })).toBe('white'))
  test('none assessed → null', () => expect(overallBelt({})).toBeNull())
  test('ignores unknown belts', () => {
    expect(overallBelt({ a: 'zzz', b: 'green' })).toBe('green')
    expect(overallBelt({ a: 'zzz' })).toBeNull()
  })
})
