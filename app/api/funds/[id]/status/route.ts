import { type FundStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

const ALL_STATUSES: readonly FundStatus[] = ['ACTIVE', 'CLOSED', 'ARCHIVED']

// V4.3.2: разрешённые переходы статуса фонда.
// ACTIVE → CLOSED (паи погашены) или ACTIVE → ARCHIVED (фонд скрыт).
// CLOSED → ARCHIVED (после закрытия можно архивировать).
// Обратные переходы запрещены — закрытый/архивированный фонд считается завершённым.
const ALLOWED_TRANSITIONS: Record<FundStatus, readonly FundStatus[]> = {
  ACTIVE:   ['CLOSED', 'ARCHIVED'],
  CLOSED:   ['ARCHIVED'],
  ARCHIVED: [],
}

function isFundStatus(value: unknown): value is FundStatus {
  return typeof value === 'string' && (ALL_STATUSES as readonly string[]).includes(value)
}

export async function PATCH(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  let nextStatus: FundStatus
  try {
    const body: unknown = await req.json()
    if (typeof body !== 'object' || body === null || !('status' in body) || !isFundStatus(body.status)) {
      return Response.json({ error: 'Некорректный статус' }, { status: 400 })
    }
    nextStatus = body.status
  } catch {
    return Response.json({ error: 'Некорректный JSON' }, { status: 400 })
  }

  try {
    const fund = await prisma.fund.findUniqueOrThrow({ where: { id: params.id } })

    if (fund.status === nextStatus) {
      return Response.json({ data: fund })
    }

    const allowed = ALLOWED_TRANSITIONS[fund.status]
    if (!allowed.includes(nextStatus)) {
      return Response.json(
        { error: `Переход ${fund.status} → ${nextStatus} запрещён` },
        { status: 409 },
      )
    }

    const updated = await prisma.fund.update({
      where: { id: params.id },
      data: { status: nextStatus },
    })
    return Response.json({ data: updated })
  } catch {
    return Response.json({ error: 'Фонд не найден' }, { status: 404 })
  }
}
