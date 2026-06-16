import { describe, it, expect } from 'vitest'

const { computeEnergyLevel, detectGluten } = (await import('../api/index.js'))

describe('computeEnergyLevel', () => {
  it('returns "Bajo" for kcal < 150 with minimum 3%', () => {
    expect(computeEnergyLevel(0)).toEqual({ level: 'Bajo', percent: 3 })
    expect(computeEnergyLevel(50)).toEqual({ level: 'Bajo', percent: 17 })
    expect(computeEnergyLevel(100)).toEqual({ level: 'Bajo', percent: 33 })
    expect(computeEnergyLevel(149)).toEqual({ level: 'Bajo', percent: 50 })
  })

  it('returns "Moderado" for 150 <= kcal <= 400', () => {
    expect(computeEnergyLevel(150)).toEqual({ level: 'Moderado', percent: 38 })
    expect(computeEnergyLevel(200)).toEqual({ level: 'Moderado', percent: 50 })
    expect(computeEnergyLevel(300)).toEqual({ level: 'Moderado', percent: 75 })
    expect(computeEnergyLevel(400)).toEqual({ level: 'Moderado', percent: 100 })
  })

  it('returns "Alto" for kcal > 400 capped at 100%', () => {
    expect(computeEnergyLevel(401)).toEqual({ level: 'Alto', percent: 67 })
    expect(computeEnergyLevel(600)).toEqual({ level: 'Alto', percent: 100 })
    expect(computeEnergyLevel(900)).toEqual({ level: 'Alto', percent: 100 })
  })

  it('handles decimal kcal values', () => {
    expect(computeEnergyLevel(0.5)).toEqual({ level: 'Bajo', percent: 3 })
  })
})

describe('detectGluten', () => {
  it('detects gluten from single text', () => {
    const result = detectGluten('harina de trigo')
    expect(result.hasGluten).toBe(true)
    expect(result.detected).toContain('trigo')
    expect(result.detected).toContain('harina')
  })

  it('detects gluten from multiple texts', () => {
    const result = detectGluten('Ingredientes: harina', 'contiene gluten')
    expect(result.hasGluten).toBe(true)
    expect(result.detected).toContain('harina')
    expect(result.detected).toContain('gluten')
  })

  it('returns no gluten for unrelated text', () => {
    const result = detectGluten('leche, huevo, azúcar')
    expect(result.hasGluten).toBe(false)
    expect(result.detected).toEqual([])
  })

  it('is case insensitive', () => {
    const result = detectGluten('HARINA DE TRIGO')
    expect(result.hasGluten).toBe(true)
    expect(result.detected).toContain('harina')
    expect(result.detected).toContain('trigo')
  })

  it('handles empty input', () => {
    expect(detectGluten('')).toEqual({ hasGluten: false, detected: [] })
    expect(detectGluten()).toEqual({ hasGluten: false, detected: [] })
  })

  it('detects all gluten keywords', () => {
    const result = detectGluten('trigo wheat harina flour avena oat cebada barley centeno rye gluten espelta kamut')
    expect(result.hasGluten).toBe(true)
    expect(result.detected.length).toBe(13)
  })

  it('handles partial word matches correctly', () => {
    const result = detectGluten('avental (no avena)')
    expect(result.hasGluten).toBe(true)
    expect(result.detected).toEqual(['avena'])
  })
})
