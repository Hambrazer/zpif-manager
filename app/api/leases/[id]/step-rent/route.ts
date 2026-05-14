import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

// GET — список ступеней лестничной ставки договора, отсортированный по startDate.
export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const steps = await prisma.leaseStepRent.findMany({
      where: { leaseId: params.id },
      orderBy: { startDate: 'asc' },
    })
    return Response.json({ data: steps })
  } catch {
    return Response.json({ error: 'Ошибка получения ступеней' }, { status: 500 })
  }
}

type IncomingStep = {
  startDate: unknown
  endDate: unknown
  rentRate: unknown
  indexAfterEnd: unknown
}

function isValidStep(s: unknown): s is IncomingStep & { startDate: string; endDate: string; rentRate: number; indexAfterEnd: boolean } {
  if (typeof s !== 'object' || s === null) return false
  const o = s as Record<string, unknown>
  return (
    typeof o['startDate'] === 'string' &&
    typeof o['endDate'] === 'string' &&
    typeof o['rentRate'] === 'number' &&
    o['rentRate'] >= 0 &&
    typeof o['indexAfterEnd'] === 'boolean'
  )
}

// POST — upsert массива ступеней целиком: удаляем все существующие и создаём новые.
// Body: { steps: Array<{ startDate, endDate, rentRate, indexAfterEnd }> }
export async function POST(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body: unknown = await req.json()
    if (typeof body !== 'object' || body === null) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const stepsRaw = (body as Record<string, unknown>)['steps']
    if (!Array.isArray(stepsRaw)) {
      return Response.json({ error: 'Поле steps должно быть массивом' }, { status: 400 })
    }

    for (const s of stepsRaw) {
      if (!isValidStep(s)) {
        return Response.json({ error: 'Некорректная ступень: startDate, endDate, rentRate, indexAfterEnd' }, { status: 400 })
      }
      if (new Date(s.endDate).getTime() <= new Date(s.startDate).getTime()) {
        return Response.json({ error: 'Дата окончания ступени должна быть позже даты начала' }, { status: 400 })
      }
    }

    // Транзакция: удалить старые, создать новые
    const created = await prisma.$transaction(async tx => {
      await tx.leaseStepRent.deleteMany({ where: { leaseId: params.id } })
      if (stepsRaw.length === 0) return []
      await tx.leaseStepRent.createMany({
        data: (stepsRaw as Array<{ startDate: string; endDate: string; rentRate: number; indexAfterEnd: boolean }>).map(s => ({
          leaseId: params.id,
          startDate: new Date(s.startDate),
          endDate: new Date(s.endDate),
          rentRate: s.rentRate,
          indexAfterEnd: s.indexAfterEnd,
        })),
      })
      return tx.leaseStepRent.findMany({
        where: { leaseId: params.id },
        orderBy: { startDate: 'asc' },
      })
    })

    return Response.json({ data: created }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ошибка сохранения ступеней' }, { status: 500 })
  }
}
