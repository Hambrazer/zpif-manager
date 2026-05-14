import { type IndexationType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

const VALID_INDEXATION = new Set<IndexationType>(['NONE', 'FIXED', 'CPI'])

// GET — текущий резерв CAPEX объекта (или null, если не задан).
export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const reserve = await prisma.capexReserve.findUnique({ where: { propertyId: params.id } })
    return Response.json({ data: reserve })
  } catch {
    return Response.json({ error: 'Ошибка получения резерва' }, { status: 500 })
  }
}

// PUT — upsert резерва: создаёт или обновляет запись для объекта.
// Body null или отсутствие резерва → удаляет запись.
export async function PUT(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body: unknown = await req.json()

    if (body === null) {
      await prisma.capexReserve.deleteMany({ where: { propertyId: params.id } })
      return Response.json({ data: null })
    }

    if (typeof body !== 'object') {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const b = body as Record<string, unknown>
    const ratePerSqm = b['ratePerSqm']
    const startDate = b['startDate']
    const indexationType = b['indexationType']
    const indexationRate = b['indexationRate']

    if (typeof ratePerSqm !== 'number' || ratePerSqm < 0) {
      return Response.json({ error: 'Укажите ставку резерва ≥ 0' }, { status: 400 })
    }
    if (typeof startDate !== 'string') {
      return Response.json({ error: 'Укажите дату начала начисления' }, { status: 400 })
    }
    if (!VALID_INDEXATION.has(indexationType as IndexationType)) {
      return Response.json({ error: 'Некорректный тип индексации' }, { status: 400 })
    }

    const idxType = indexationType as IndexationType
    let idxRate: number | null = null
    if (idxType === 'FIXED') {
      if (typeof indexationRate !== 'number' || indexationRate < 0) {
        return Response.json({ error: 'Укажите ставку индексации для FIXED' }, { status: 400 })
      }
      idxRate = indexationRate
    }

    const reserve = await prisma.capexReserve.upsert({
      where: { propertyId: params.id },
      create: {
        propertyId: params.id,
        ratePerSqm,
        startDate: new Date(startDate),
        indexationType: idxType,
        indexationRate: idxRate,
      },
      update: {
        ratePerSqm,
        startDate: new Date(startDate),
        indexationType: idxType,
        indexationRate: idxRate,
      },
    })

    return Response.json({ data: reserve })
  } catch {
    return Response.json({ error: 'Ошибка сохранения резерва' }, { status: 500 })
  }
}

// DELETE — удалить резерв.
export async function DELETE(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    await prisma.capexReserve.deleteMany({ where: { propertyId: params.id } })
    return Response.json({ data: null })
  } catch {
    return Response.json({ error: 'Ошибка удаления резерва' }, { status: 500 })
  }
}
