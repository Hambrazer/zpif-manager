import { type DistributionPeriodicity } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

export async function GET() {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const funds = await prisma.fund.findMany({
      include: { _count: { select: { properties: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return Response.json({ data: funds })
  } catch {
    return Response.json({ error: 'Ошибка получения фондов' }, { status: 500 })
  }
}

const VALID_PERIODICITY = new Set<DistributionPeriodicity>(['MONTHLY', 'QUARTERLY', 'ANNUAL'])

export async function POST(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body: unknown = await req.json()

    if (typeof body !== 'object' || body === null) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const b = body as Record<string, unknown>

    if (
      typeof b['name'] !== 'string' ||
      typeof b['startDate'] !== 'string' ||
      typeof b['endDate'] !== 'string' ||
      typeof b['totalEmission'] !== 'number' ||
      typeof b['nominalUnitPrice'] !== 'number' ||
      typeof b['totalUnits'] !== 'number' ||
      typeof b['managementFeeRate'] !== 'number' ||
      typeof b['fundExpensesRate'] !== 'number' ||
      typeof b['upfrontFeeRate'] !== 'number' ||
      typeof b['successFeeOperational'] !== 'number' ||
      typeof b['successFeeExit'] !== 'number' ||
      !VALID_PERIODICITY.has(b['distributionPeriodicity'] as DistributionPeriodicity)
    ) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const fund = await prisma.fund.create({
      data: {
        name: b['name'] as string,
        registrationNumber: typeof b['registrationNumber'] === 'string' ? b['registrationNumber'] || null : null,
        startDate: new Date(b['startDate'] as string),
        endDate: new Date(b['endDate'] as string),
        totalEmission: b['totalEmission'] as number,
        nominalUnitPrice: b['nominalUnitPrice'] as number,
        totalUnits: b['totalUnits'] as number,
        managementFeeRate: b['managementFeeRate'] as number,
        fundExpensesRate: b['fundExpensesRate'] as number,
        upfrontFeeRate: b['upfrontFeeRate'] as number,
        successFeeOperational: b['successFeeOperational'] as number,
        successFeeExit: b['successFeeExit'] as number,
        distributionPeriodicity: b['distributionPeriodicity'] as DistributionPeriodicity,
        hasDebt: typeof b['hasDebt'] === 'boolean' ? b['hasDebt'] : false,
      },
    })

    return Response.json({ data: fund }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ошибка создания фонда' }, { status: 500 })
  }
}
