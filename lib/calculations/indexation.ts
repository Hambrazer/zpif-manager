import type { IndexationType } from '../types'

/**
 * Возвращает количество годовщин от startDate, наступивших не позже targetDate.
 * Годовщина i = startDate + i лет (тот же месяц и день).
 */
function countAnniversaries(startDate: Date, targetDate: Date): number {
  let count = 0
  const anniversary = new Date(startDate)
  anniversary.setFullYear(anniversary.getFullYear() + 1)
  while (anniversary <= targetDate) {
    count++
    anniversary.setFullYear(anniversary.getFullYear() + 1)
  }
  return count
}

/**
 * Рассчитывает проиндексированную ставку аренды на дату targetDate.
 *
 * Индексация применяется ежегодно в дату годовщины договора.
 * Для CPI: на годовщину в году Y применяется cpiValues[Y-1]
 * (ИПЦ предшествующего года, известный к моменту индексации).
 *
 * @param baseRent    базовая ставка, ₽/м²/год
 * @param startDate   дата начала договора (от неё отсчитываются годовщины)
 * @param targetDate  дата, на которую нужна проиндексированная ставка
 * @param type        тип индексации: CPI | FIXED | NONE
 * @param rate        фиксированная ставка индексации, доля (0.05 = 5%); для CPI/NONE — null
 * @param cpiValues   ИПЦ по годам, Record<год, доля> (напр. { 2021: 0.08 })
 */
export function calcIndexedRent(
  baseRent: number,
  startDate: Date,
  targetDate: Date,
  type: IndexationType,
  rate: number | null,
  cpiValues: Record<number, number>
): number {
  if (type === 'NONE') {
    return baseRent
  }

  if (type === 'FIXED') {
    const n = countAnniversaries(startDate, targetDate)
    return baseRent * Math.pow(1 + (rate ?? 0), n)
  }

  // CPI: каждую годовщину умножаем на (1 + cpiValues[год_перед_годовщиной])
  let rent = baseRent
  const anniversary = new Date(startDate)
  let i = 0
  anniversary.setFullYear(anniversary.getFullYear() + 1)
  while (anniversary <= targetDate) {
    i++
    const cpiYear = startDate.getFullYear() + i - 1
    const cpi = cpiValues[cpiYear] ?? 0
    rent *= 1 + cpi
    anniversary.setFullYear(anniversary.getFullYear() + 1)
  }
  return rent
}
