import { describe, it, expect } from 'vitest'

const { computeStats } = await import('../api/stats.js')

// 2026-07-01 12:00 hora CDMX (UTC-6) expresado en UTC
const NOW = Date.parse('2026-07-01T18:00:00Z')
const DAY = 86400000
const log = (data) => ({ id: 'x', data })

describe('computeStats', () => {
  it('returns zeros for empty collection', () => {
    const s = computeStats([], new Map(), NOW)
    expect(s.total).toBe(0)
    expect(s.today).toBe(0)
    expect(s.uniqueProducts).toBe(0)
    expect(s.notFoundPct).toBe(0)
    expect(s.ocrPct).toBe(0)
    expect(s.byDay).toHaveLength(30)
    expect(s.byDay[29].date).toBe('2026-07-01')
    expect(s.byDay[0].date).toBe('2026-06-02')
    expect(s.byDay.every(d => d.count === 0)).toBe(true)
    expect(s.topProducts).toEqual([])
  })

  it('counts totals, today, uniques and percentages', () => {
    const items = [
      log({ ts: NOW, barcode: 'A', country: 'MX', os: 'Android' }),
      log({ ts: NOW - 1000, barcode: 'A', country: 'MX', os: 'iOS', hasOcr: true }),
      log({ ts: NOW - 2 * DAY, barcode: 'B', country: 'US', os: 'Android', notFound: true }),
      log({ ts: NOW - 3 * DAY, barcode: 'C', country: 'MX', os: 'Windows', hasNutritionOcr: true }),
    ]
    const s = computeStats(items, new Map([['A', 'Pan Bimbo']]), NOW)
    expect(s.total).toBe(4)
    expect(s.today).toBe(2)
    expect(s.uniqueProducts).toBe(3)
    expect(s.notFoundPct).toBe(25)
    expect(s.ocrPct).toBe(50)
  })

  it('builds byDay series zero-filled for 30 days', () => {
    const items = [
      log({ ts: NOW, barcode: 'A' }),
      log({ ts: NOW - 2 * DAY, barcode: 'A' }),
      log({ ts: NOW - 2 * DAY, barcode: 'B' }),
      log({ ts: NOW - 40 * DAY, barcode: 'C' }), // fuera de ventana: no aparece
    ]
    const s = computeStats(items, new Map(), NOW)
    expect(s.byDay[29]).toEqual({ date: '2026-07-01', count: 1 })
    expect(s.byDay[27]).toEqual({ date: '2026-06-29', count: 2 })
    expect(s.byDay[28]).toEqual({ date: '2026-06-30', count: 0 })
    expect(s.total).toBe(4) // total sí cuenta todo
  })

  it('ranks topProducts with names and byCountry/byOS descending', () => {
    const items = [
      log({ ts: NOW, barcode: 'A', country: 'MX', os: 'Android' }),
      log({ ts: NOW, barcode: 'A', country: 'MX', os: 'Android' }),
      log({ ts: NOW, barcode: 'B', country: 'US', os: 'iOS' }),
    ]
    const s = computeStats(items, new Map([['A', 'Pan Bimbo']]), NOW)
    expect(s.topProducts[0]).toEqual({ barcode: 'A', name: 'Pan Bimbo', count: 2 })
    expect(s.topProducts[1]).toEqual({ barcode: 'B', name: '', count: 1 })
    expect(s.byCountry[0]).toEqual({ key: 'MX', count: 2 })
    expect(s.byOS[0]).toEqual({ key: 'Android', count: 2 })
  })

  it('ignores items with null data and caps topProducts at 10', () => {
    const items = [log(null)]
    for (let i = 0; i < 12; i++) items.push(log({ ts: NOW, barcode: 'B' + i }))
    const s = computeStats(items, new Map(), NOW)
    expect(s.total).toBe(13) // el null cuenta en total pero no rompe
    expect(s.topProducts).toHaveLength(10)
  })
})
