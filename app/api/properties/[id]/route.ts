import { type Prisma, type PropertyType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

const VALID_PROPERTY_TYPES = new Set<PropertyType>(['OFFICE', 'WAREHOUSE', 'RETAIL', 'MIXED', 'RESIDENTIAL'])

export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const property = await prisma.property.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        leaseContracts: { orderBy: { startDate: 'asc' } },
        capexItems: { orderBy: { plannedDate: 'asc' } },
      },
    })
    return Response.json({ data: property })
  } catch {
    return Response.json({ error: 'Объект не найден' }, { status: 404 })
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
    const upd: Prisma.PropertyUpdateInput = {}

    if (typeof b['name'] === 'string') upd.name = b['name']
    if (VALID_PROPERTY_TYPES.has(b['type'] as PropertyType)) upd.type = b['type'] as PropertyType
    if (typeof b['address'] === 'string') upd.address = b['address']
    if (typeof b['totalArea'] === 'number') upd.totalArea = b['totalArea']
    if (typeof b['rentableArea'] === 'number') upd.rentableArea = b['rentableArea']
    if (typeof b['cadastralValue'] === 'number' || b['cadastralValue'] === null) upd.cadastralValue = b['cadastralValue'] as number | null
    if (typeof b['landCadastralValue'] === 'number' || b['landCadastralValue'] === null) upd.landCadastralValue = b['landCadastralValue'] as number | null
    if (typeof b['propertyTaxRate'] === 'number') upd.propertyTaxRate = b['propertyTaxRate']
    if (typeof b['landTaxRate'] === 'number') upd.landTaxRate = b['landTaxRate']
    if (typeof b['opexRate'] === 'number') upd.opexRate = b['opexRate']
    if (typeof b['maintenanceRate'] === 'number') upd.maintenanceRate = b['maintenanceRate']
    if (typeof b['acquisitionPrice'] === 'number' || b['acquisitionPrice'] === null) upd.acquisitionPrice = b['acquisitionPrice'] as number | null
    if ('purchaseDate' in b) upd.purchaseDate = typeof b['purchaseDate'] === 'string' ? new Date(b['purchaseDate']) : null
    if ('saleDate' in b) upd.saleDate = typeof b['saleDate'] === 'string' ? new Date(b['saleDate']) : null
    if (typeof b['exitCapRate'] === 'number' || b['exitCapRate'] === null) upd.exitCapRate = b['exitCapRate'] as number | null
    if (typeof b['wacc'] === 'number') upd.wacc = b['wacc']

    const property = await prisma.property.update({ where: { id: params.id }, data: upd })
    return Response.json({ data: property })
  } catch {
    return Response.json({ error: 'Объект не найден' }, { status: 404 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    await prisma.property.delete({ where: { id: params.id } })
    return Response.json({ data: null })
  } catch {
    return Response.json({ error: 'Объект не найден' }, { status: 404 })
  }
}
