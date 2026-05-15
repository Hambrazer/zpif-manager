import { type PropertyType, type TerminalType, type PipelineStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

const VALID_PROPERTY_TYPES = new Set<PropertyType>(['OFFICE', 'WAREHOUSE', 'RETAIL', 'MIXED', 'RESIDENTIAL'])
const VALID_TERMINAL_TYPES = new Set<TerminalType>(['EXIT_CAP_RATE', 'GORDON'])
const VALID_PIPELINE_STATUSES = new Set<PipelineStatus>(['SCREENING', 'DUE_DILIGENCE', 'APPROVED', 'IN_FUND', 'REJECTED', 'SOLD'])

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const fundId = searchParams.get('fundId')
  const status = searchParams.get('status')

  const whereClauses: Record<string, unknown> = {}
  if (fundId) whereClauses['funds'] = { some: { fundId } }
  if (status && VALID_PIPELINE_STATUSES.has(status as PipelineStatus)) {
    whereClauses['pipelineStatus'] = status as PipelineStatus
  }

  try {
    const properties = await prisma.property.findMany({
      ...(Object.keys(whereClauses).length > 0 ? { where: whereClauses } : {}),
      include: {
        _count: { select: { leaseContracts: true } },
        funds: { include: { fund: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return Response.json({ data: properties })
  } catch {
    return Response.json({ error: 'Ошибка получения объектов' }, { status: 500 })
  }
}

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
      !VALID_PROPERTY_TYPES.has(b['type'] as PropertyType) ||
      typeof b['address'] !== 'string' ||
      typeof b['totalArea'] !== 'number' ||
      typeof b['rentableArea'] !== 'number' ||
      typeof b['propertyTaxRate'] !== 'number' ||
      typeof b['landTaxRate'] !== 'number' ||
      typeof b['opexRate'] !== 'number' ||
      typeof b['maintenanceRate'] !== 'number' ||
      typeof b['wacc'] !== 'number'
    ) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const terminalType = VALID_TERMINAL_TYPES.has(b['terminalType'] as TerminalType)
      ? (b['terminalType'] as TerminalType)
      : undefined // undefined → схема подставит дефолт EXIT_CAP_RATE

    const projectionYears = typeof b['projectionYears'] === 'number' && b['projectionYears'] > 0
      ? Math.trunc(b['projectionYears'])
      : undefined // undefined → схема подставит дефолт 10

    // Опциональная привязка к фонду при создании (для UX «создать из фонда»).
    // Если fundId передан — создаём связь FundProperty и ставим IN_FUND, иначе — pipeline.
    const fundId = typeof b['fundId'] === 'string' ? b['fundId'] : null
    const ownershipPct = typeof b['ownershipPct'] === 'number' ? b['ownershipPct'] : 100

    const property = await prisma.property.create({
      data: {
        name: b['name'] as string,
        type: b['type'] as PropertyType,
        address: b['address'] as string,
        totalArea: b['totalArea'] as number,
        rentableArea: b['rentableArea'] as number,
        pipelineStatus: fundId ? 'IN_FUND' : 'SCREENING',
        cadastralValue: typeof b['cadastralValue'] === 'number' ? b['cadastralValue'] : null,
        landCadastralValue: typeof b['landCadastralValue'] === 'number' ? b['landCadastralValue'] : null,
        propertyTaxRate: b['propertyTaxRate'] as number,
        landTaxRate: b['landTaxRate'] as number,
        opexRate: b['opexRate'] as number,
        maintenanceRate: b['maintenanceRate'] as number,
        acquisitionPrice: typeof b['acquisitionPrice'] === 'number' ? b['acquisitionPrice'] : null,
        purchaseDate: typeof b['purchaseDate'] === 'string' ? new Date(b['purchaseDate']) : null,
        saleDate: typeof b['saleDate'] === 'string' ? new Date(b['saleDate']) : null,
        exitCapRate: typeof b['exitCapRate'] === 'number' ? b['exitCapRate'] : null,
        wacc: b['wacc'] as number,
        ...(projectionYears !== undefined ? { projectionYears } : {}),
        ...(terminalType !== undefined ? { terminalType } : {}),
        gordonGrowthRate: typeof b['gordonGrowthRate'] === 'number' ? b['gordonGrowthRate'] : null,
        ...(fundId ? { funds: { create: [{ fundId, ownershipPct }] } } : {}),
      },
    })

    return Response.json({ data: property }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ошибка создания объекта' }, { status: 500 })
  }
}
