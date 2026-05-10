import { type Prisma, AmortizationType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const debt = await prisma.fundDebt.findUniqueOrThrow({ where: { id: params.id } })
    return Response.json({ data: debt })
  } catch {
    return Response.json({ error: 'Долг фонда не найден' }, { status: 404 })
  }
}

export async function PUT(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body: unknown = await req.json()
    if (typeof body !== 'object' || body === null) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const b = body as Record<string, unknown>
    const upd: Prisma.FundDebtUpdateInput = {}

    if (typeof b['lenderName'] === 'string') upd.lenderName = b['lenderName']
    if (typeof b['principalAmount'] === 'number') upd.principalAmount = b['principalAmount']
    if (typeof b['interestRate'] === 'number') upd.interestRate = b['interestRate']
    if (typeof b['startDate'] === 'string') upd.startDate = new Date(b['startDate'])
    if (typeof b['endDate'] === 'string') upd.endDate = new Date(b['endDate'])
    if (typeof b['amortizationType'] === 'string') upd.amortizationType = b['amortizationType'] as AmortizationType

    const debt = await prisma.fundDebt.update({ where: { id: params.id }, data: upd })
    return Response.json({ data: debt })
  } catch {
    return Response.json({ error: 'Долг фонда не найден' }, { status: 404 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    await prisma.fundDebt.delete({ where: { id: params.id } })
    return Response.json({ data: null })
  } catch {
    return Response.json({ error: 'Долг фонда не найден' }, { status: 404 })
  }
}
