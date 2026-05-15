import { type PipelineStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

const VALID_STATUSES = new Set<PipelineStatus>([
  'SCREENING',
  'DUE_DILIGENCE',
  'APPROVED',
  'IN_FUND',
  'REJECTED',
  'SOLD',
])

// V3.8.3: матрица допустимых переходов pipeline-статуса для ручной смены через PATCH.
//
// Правила:
// - IN_FUND вручную поставить нельзя (проставляется автоматически при привязке к фонду — V3.8.4).
// - SOLD доступен только из IN_FUND (объект «был в фонде»).
// - Из SOLD — терминальное состояние, ручные переходы запрещены.
// - Из IN_FUND кроме SOLD ничего вручную нельзя (отвязка делается через DELETE FundProperty в V3.8.4 —
//   тогда статус автоматически вернётся на APPROVED).
// - Между «открытыми» статусами {SCREENING, DUE_DILIGENCE, APPROVED, REJECTED} переходы свободные.
const OPEN_STATUSES: PipelineStatus[] = ['SCREENING', 'DUE_DILIGENCE', 'APPROVED', 'REJECTED']

function isAllowedTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  if (to === 'IN_FUND') return false
  if (from === 'SOLD') return false
  if (from === 'IN_FUND') return to === 'SOLD'
  if (to === 'SOLD') return false
  return OPEN_STATUSES.includes(from) && OPEN_STATUSES.includes(to)
}

export async function PATCH(req: Request, { params }: Params) {
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
  const status = (body as Record<string, unknown>)['status']
  if (typeof status !== 'string' || !VALID_STATUSES.has(status as PipelineStatus)) {
    return Response.json({ error: 'Недопустимый статус' }, { status: 400 })
  }

  const current = await prisma.property.findUnique({
    where: { id: params.id },
    select: { pipelineStatus: true },
  })
  if (!current) {
    return Response.json({ error: 'Объект не найден' }, { status: 404 })
  }

  const next = status as PipelineStatus
  if (current.pipelineStatus === next) {
    return Response.json({ data: { id: params.id, pipelineStatus: next } })
  }
  if (!isAllowedTransition(current.pipelineStatus, next)) {
    return Response.json(
      { error: `Недопустимый переход: ${current.pipelineStatus} → ${next}` },
      { status: 400 }
    )
  }

  try {
    const updated = await prisma.property.update({
      where: { id: params.id },
      data: { pipelineStatus: next },
      select: { id: true, pipelineStatus: true },
    })
    return Response.json({ data: updated })
  } catch {
    return Response.json({ error: 'Ошибка обновления статуса' }, { status: 500 })
  }
}
