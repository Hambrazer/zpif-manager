import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string; propertyId: string } }

// V3.8.4: DELETE /api/funds/[id]/properties/[propertyId] — отвязать объект от фонда.
// При успехе: удаляется FundProperty + если у объекта больше нет привязок к фондам,
// статус автоматически возвращается на APPROVED (объект попадает обратно в pipeline).
// Если статус уже SOLD — не трогаем (объект продан, в pipeline не возвращается).
export async function DELETE(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  const link = await prisma.fundProperty.findUnique({
    where: { fundId_propertyId: { fundId: params.id, propertyId: params.propertyId } },
    select: { id: true },
  })
  if (!link) {
    return Response.json({ error: 'Привязка не найдена' }, { status: 404 })
  }

  try {
    await prisma.fundProperty.delete({ where: { id: link.id } })

    const remaining = await prisma.fundProperty.count({
      where: { propertyId: params.propertyId },
    })

    if (remaining === 0) {
      const property = await prisma.property.findUnique({
        where: { id: params.propertyId },
        select: { pipelineStatus: true },
      })
      // Возвращаем на APPROVED только из IN_FUND. SOLD — терминальный, не трогаем.
      if (property?.pipelineStatus === 'IN_FUND') {
        await prisma.property.update({
          where: { id: params.propertyId },
          data: { pipelineStatus: 'APPROVED' },
        })
      }
    }

    return Response.json({ data: null })
  } catch {
    return Response.json({ error: 'Ошибка отвязки объекта от фонда' }, { status: 500 })
  }
}
