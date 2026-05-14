import type { IndexationType, LeaseStepRentInput } from '../types'

/**
 * Возвращает список дат индексации, наступивших не позже targetDate.
 *
 * Поведение:
 * - Если firstIndexationDate не задана → индексации ежегодно в годовщину startDate
 *   (первая годовщина = startDate + 1 год).
 * - Если задана → первая индексация в firstIndexationDate, далее каждые
 *   indexationFrequency месяцев. Если indexationFrequency не задана — 12.
 */
function listIndexationDates(
  startDate: Date,
  targetDate: Date,
  firstIndexationDate: Date | null | undefined,
  indexationFrequency: number | null | undefined
): Date[] {
  const dates: Date[] = []

  if (firstIndexationDate) {
    const stepMonths = indexationFrequency && indexationFrequency > 0 ? indexationFrequency : 12
    const cursor = new Date(firstIndexationDate)
    while (cursor <= targetDate) {
      dates.push(new Date(cursor))
      cursor.setMonth(cursor.getMonth() + stepMonths)
    }
    return dates
  }

  const cursor = new Date(startDate)
  cursor.setFullYear(cursor.getFullYear() + 1)
  while (cursor <= targetDate) {
    dates.push(new Date(cursor))
    cursor.setFullYear(cursor.getFullYear() + 1)
  }
  return dates
}

/**
 * Рассчитывает проиндексированную ставку аренды на дату targetDate.
 *
 * Индексация применяется ежегодно в дату годовщины договора, либо — если задана
 * firstIndexationDate — в эту дату и далее каждые indexationFrequency месяцев.
 *
 * Для CPI: на индексацию в году Y применяется cpiValues[Y-1]
 * (ИПЦ предшествующего года, известный к моменту индексации).
 *
 * @param baseRent              базовая ставка, ₽/м²/год
 * @param startDate             дата начала договора
 * @param targetDate            дата, на которую нужна проиндексированная ставка
 * @param type                  тип индексации: CPI | FIXED | NONE
 * @param rate                  фиксированная ставка индексации, доля (0.05 = 5%); для CPI/NONE — null
 * @param cpiValues             ИПЦ по годам, Record<год, доля> (напр. { 2021: 0.08 })
 * @param firstIndexationDate   опц.: дата первой индексации
 * @param indexationFrequency   опц.: частота индексации в месяцах (по умолчанию 12)
 */
export function calcIndexedRent(
  baseRent: number,
  startDate: Date,
  targetDate: Date,
  type: IndexationType,
  rate: number | null,
  cpiValues: Record<number, number>,
  firstIndexationDate?: Date | null,
  indexationFrequency?: number | null
): number {
  if (type === 'NONE') {
    return baseRent
  }

  const events = listIndexationDates(startDate, targetDate, firstIndexationDate, indexationFrequency)
  if (events.length === 0) return baseRent

  if (type === 'FIXED') {
    return baseRent * Math.pow(1 + (rate ?? 0), events.length)
  }

  // CPI: на каждую индексацию умножаем на (1 + cpiValues[год_перед_индексацией])
  let rent = baseRent
  for (const eventDate of events) {
    const cpiYear = eventDate.getFullYear() - 1
    rent *= 1 + (cpiValues[cpiYear] ?? 0)
  }
  return rent
}

/**
 * Рассчитывает ставку аренды на targetDate с учётом лестничных ступеней.
 *
 * Логика приоритетов:
 * - Если ступеней нет → стандартная calcIndexedRent от baseRent.
 * - Если targetDate попадает в одну из ступеней (startDate ≤ t ≤ endDate) →
 *   возвращается rentRate этой ступени без индексации.
 * - Если targetDate позже всех ступеней → берётся последняя прошедшая ступень:
 *   - indexAfterEnd = true  → calcIndexedRent от её rentRate, база от endDate;
 *   - indexAfterEnd = false → rentRate без изменений.
 * - Если targetDate раньше первой ступени → fallback к baseRent + индексация.
 *
 * @param baseRent              базовая ставка договора (fallback)
 * @param stepRents             массив ступеней (может быть пустым)
 * @param leaseStartDate        дата начала договора (для индексации baseRent)
 * @param targetDate            дата, на которую нужна ставка
 * @param type, rate, cpiValues, firstIndexationDate, indexationFrequency — как в calcIndexedRent
 */
export function calcStepRent(
  baseRent: number,
  stepRents: LeaseStepRentInput[],
  leaseStartDate: Date,
  targetDate: Date,
  type: IndexationType,
  rate: number | null,
  cpiValues: Record<number, number>,
  firstIndexationDate?: Date | null,
  indexationFrequency?: number | null
): number {
  if (stepRents.length === 0) {
    return calcIndexedRent(baseRent, leaseStartDate, targetDate, type, rate, cpiValues, firstIndexationDate, indexationFrequency)
  }

  const sorted = [...stepRents].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  // Активная ступень: targetDate внутри её диапазона
  const active = sorted.find(s => s.startDate <= targetDate && targetDate <= s.endDate)
  if (active) return active.rentRate

  // Последняя прошедшая ступень (endDate < targetDate)
  const past = sorted.filter(s => s.endDate < targetDate)
  if (past.length > 0) {
    const last = past[past.length - 1]!
    if (last.indexAfterEnd) {
      // База индексации = ставка последней ступени, отсчёт — от её endDate
      return calcIndexedRent(last.rentRate, last.endDate, targetDate, type, rate, cpiValues, firstIndexationDate, indexationFrequency)
    }
    return last.rentRate
  }

  // targetDate раньше первой ступени — стандартный fallback
  return calcIndexedRent(baseRent, leaseStartDate, targetDate, type, rate, cpiValues, firstIndexationDate, indexationFrequency)
}
