import { type Prisma, type IndexationType, type LeaseStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

const VALID_INDEXATION = new Set<IndexationType>(['CPI', 'FIXED', 'NONE'])
const VALID_STATUS = new Set<LeaseStatus>(['ACTIVE', 'EXPIRED', 'TERMINATING'])

export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const lease = await prisma.leaseContract.findUniqueOrThrow({ where: { id: params.id } })
    return Response.json({ data: lease })
  } catch {
    return Response.json({ error: 'Договор не найден' }, { status: 404 })
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
    const upd: Prisma.LeaseContractUpdateInput = {}

    if (typeof b['tenantName'] === 'string') upd.tenantName = b['tenantName']
    if (typeof b['area'] === 'number') upd.area = b['area']
    if (typeof b['baseRent'] === 'number') upd.baseRent = b['baseRent']
    if (typeof b['startDate'] === 'string') upd.startDate = new Date(b['startDate'])
    if (typeof b['endDate'] === 'string') upd.endDate = new Date(b['endDate'])
    if (VALID_INDEXATION.has(b['indexationType'] as IndexationType)) upd.indexationType = b['indexationType'] as IndexationType
    if ('indexationRate' in b) upd.indexationRate = typeof b['indexationRate'] === 'number' ? b['indexationRate'] : null
    if ('firstIndexationDate' in b) upd.firstIndexationDate = typeof b['firstIndexationDate'] === 'string' ? new Date(b['firstIndexationDate']) : null
    if ('indexationFrequency' in b) upd.indexationFrequency = typeof b['indexationFrequency'] === 'number' ? b['indexationFrequency'] : null
    if (typeof b['opexReimbursementRate'] === 'number') upd.opexReimbursementRate = b['opexReimbursementRate']
    if (VALID_INDEXATION.has(b['opexReimbursementIndexationType'] as IndexationType)) {
      upd.opexReimbursementIndexationType = b['opexReimbursementIndexationType'] as IndexationType
    }
    if ('opexReimbursementIndexationRate' in b) {
      upd.opexReimbursementIndexationRate = typeof b['opexReimbursementIndexationRate'] === 'number'
        ? b['opexReimbursementIndexationRate']
        : null
    }
    if ('opexFirstIndexationDate' in b) upd.opexFirstIndexationDate = typeof b['opexFirstIndexationDate'] === 'string' ? new Date(b['opexFirstIndexationDate']) : null
    if ('opexIndexationFrequency' in b) upd.opexIndexationFrequency = typeof b['opexIndexationFrequency'] === 'number' ? b['opexIndexationFrequency'] : null
    if ('securityDeposit' in b) upd.securityDeposit = typeof b['securityDeposit'] === 'number' ? b['securityDeposit'] : null
    if (VALID_STATUS.has(b['status'] as LeaseStatus)) upd.status = b['status'] as LeaseStatus
    if (typeof b['renewalOption'] === 'boolean') upd.renewalOption = b['renewalOption']
    if (typeof b['breakOption'] === 'boolean') upd.breakOption = b['breakOption']
    if (typeof b['vatIncluded'] === 'boolean') upd.vatIncluded = b['vatIncluded']

    const lease = await prisma.leaseContract.update({ where: { id: params.id }, data: upd })
    return Response.json({ data: lease })
  } catch {
    return Response.json({ error: 'Договор не найден' }, { status: 404 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    await prisma.leaseContract.delete({ where: { id: params.id } })
    return Response.json({ data: null })
  } catch {
    return Response.json({ error: 'Договор не найден' }, { status: 404 })
  }
}
