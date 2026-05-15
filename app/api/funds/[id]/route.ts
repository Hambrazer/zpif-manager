import { type Prisma, type DistributionPeriodicity } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

const VALID_PERIODICITY = new Set<DistributionPeriodicity>(['MONTHLY', 'QUARTERLY', 'ANNUAL'])

export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const fund = await prisma.fund.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        properties: { include: { property: true }, orderBy: { addedAt: 'asc' } },
        fundDebts: true,
        _count: { select: { properties: true } },
      },
    })
    return Response.json({ data: fund })
  } catch {
    return Response.json({ error: 'Фонд не найден' }, { status: 404 })
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
    const upd: Prisma.FundUpdateInput = {}

    if (typeof b['name'] === 'string') upd.name = b['name']
    if (typeof b['registrationNumber'] === 'string' || b['registrationNumber'] === null) {
      upd.registrationNumber = (b['registrationNumber'] as string | null) || null
    }
    if (typeof b['startDate'] === 'string') upd.startDate = new Date(b['startDate'])
    if (typeof b['endDate'] === 'string') upd.endDate = new Date(b['endDate'])
    if (typeof b['totalEmission'] === 'number') upd.totalEmission = b['totalEmission']
    if (typeof b['nominalUnitPrice'] === 'number') upd.nominalUnitPrice = b['nominalUnitPrice']
    if (typeof b['totalUnits'] === 'number') upd.totalUnits = b['totalUnits']
    if (typeof b['managementFeeRate'] === 'number') upd.managementFeeRate = b['managementFeeRate']
    if (typeof b['fundExpensesRate'] === 'number') upd.fundExpensesRate = b['fundExpensesRate']
    if (typeof b['upfrontFeeRate'] === 'number') upd.upfrontFeeRate = b['upfrontFeeRate']
    if (typeof b['successFeeOperational'] === 'number') upd.successFeeOperational = b['successFeeOperational']
    if (typeof b['successFeeExit'] === 'number') upd.successFeeExit = b['successFeeExit']
    if (VALID_PERIODICITY.has(b['distributionPeriodicity'] as DistributionPeriodicity)) {
      upd.distributionPeriodicity = b['distributionPeriodicity'] as DistributionPeriodicity
    }
    if (typeof b['hasDebt'] === 'boolean') upd.hasDebt = b['hasDebt']

    const fund = await prisma.fund.update({ where: { id: params.id }, data: upd })
    return Response.json({ data: fund })
  } catch {
    return Response.json({ error: 'Фонд не найден' }, { status: 404 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    await prisma.fund.delete({ where: { id: params.id } })
    return Response.json({ data: null })
  } catch {
    return Response.json({ error: 'Фонд не найден' }, { status: 404 })
  }
}
