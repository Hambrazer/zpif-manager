import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

// V3.8.4: POST /api/funds/[id]/properties — привязать объект из pipeline к фонду.
// Объект должен быть в статусе APPROVED и ещё не привязан к этому фонду.
// При успехе: создаётся FundProperty + статус объекта автоматически меняется на IN_FUND
// (в одной транзакции, минуя PATCH-эндпоинт, который запрещает ручную установку IN_FUND).
export async function POST(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Некорректные данные' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Некорректные данные' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const propertyId = b['propertyId']
  const rawOwnership = b['ownershipPct']

  if (typeof propertyId !== 'string' || propertyId.length === 0) {
    return Response.json({ error: 'Не указан propertyId' }, { status: 400 })
  }
  const ownershipPct = typeof rawOwnership === 'number' ? rawOwnership : 100
  if (ownershipPct <= 0 || ownershipPct > 100) {
    return Response.json({ error: '% владения должен быть в диапазоне (0; 100]' }, { status: 400 })
  }

  const fund = await prisma.fund.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!fund) return Response.json({ error: 'Фонд не найден' }, { status: 404 })

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, pipelineStatus: true },
  })
  if (!property) return Response.json({ error: 'Объект не найден' }, { status: 404 })

  if (property.pipelineStatus !== 'APPROVED') {
    return Response.json(
      { error: 'Привязать можно только объекты в статусе «Одобрен»' },
      { status: 400 }
    )
  }

  const existing = await prisma.fundProperty.findUnique({
    where: { fundId_propertyId: { fundId: fund.id, propertyId: property.id } },
    select: { id: true },
  })
  if (existing) {
    return Response.json({ error: 'Объект уже привязан к этому фонду' }, { status: 409 })
  }

  try {
    const [fundProperty] = await prisma.$transaction([
      prisma.fundProperty.create({
        data: { fundId: fund.id, propertyId: property.id, ownershipPct },
      }),
      prisma.property.update({
        where: { id: property.id },
        data: { pipelineStatus: 'IN_FUND' },
      }),
    ])
    return Response.json({ data: fundProperty }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ошибка привязки объекта к фонду' }, { status: 500 })
  }
}
