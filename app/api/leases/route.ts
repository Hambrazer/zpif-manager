import { type IndexationType, type LeaseStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

const VALID_INDEXATION = new Set<IndexationType>(['CPI', 'FIXED', 'NONE'])
const VALID_STATUS = new Set<LeaseStatus>(['ACTIVE', 'EXPIRED', 'TERMINATING'])

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')

  try {
    const leases = await prisma.leaseContract.findMany({
      ...(propertyId ? { where: { propertyId } } : {}),
      orderBy: { startDate: 'asc' },
    })
    return Response.json({ data: leases })
  } catch {
    return Response.json({ error: 'Ошибка получения договоров' }, { status: 500 })
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
      typeof b['propertyId'] !== 'string' ||
      typeof b['tenantName'] !== 'string' ||
      typeof b['area'] !== 'number' ||
      typeof b['baseRent'] !== 'number' ||
      typeof b['startDate'] !== 'string' ||
      typeof b['endDate'] !== 'string' ||
      !VALID_INDEXATION.has(b['indexationType'] as IndexationType) ||
      typeof b['opexReimbursementRate'] !== 'number' ||
      !VALID_INDEXATION.has(b['opexReimbursementIndexationType'] as IndexationType) ||
      !VALID_STATUS.has(b['status'] as LeaseStatus)
    ) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const lease = await prisma.leaseContract.create({
      data: {
        propertyId: b['propertyId'] as string,
        tenantName: b['tenantName'] as string,
        area: b['area'] as number,
        baseRent: b['baseRent'] as number,
        startDate: new Date(b['startDate'] as string),
        endDate: new Date(b['endDate'] as string),
        indexationType: b['indexationType'] as IndexationType,
        indexationRate: typeof b['indexationRate'] === 'number' ? b['indexationRate'] : null,
        firstIndexationDate: typeof b['firstIndexationDate'] === 'string' ? new Date(b['firstIndexationDate']) : null,
        indexationFrequency: typeof b['indexationFrequency'] === 'number' ? b['indexationFrequency'] : null,
        opexReimbursementRate: b['opexReimbursementRate'] as number,
        opexReimbursementIndexationType: b['opexReimbursementIndexationType'] as IndexationType,
        opexReimbursementIndexationRate: typeof b['opexReimbursementIndexationRate'] === 'number'
          ? b['opexReimbursementIndexationRate']
          : null,
        opexFirstIndexationDate: typeof b['opexFirstIndexationDate'] === 'string' ? new Date(b['opexFirstIndexationDate']) : null,
        opexIndexationFrequency: typeof b['opexIndexationFrequency'] === 'number' ? b['opexIndexationFrequency'] : null,
        securityDeposit: typeof b['securityDeposit'] === 'number' ? b['securityDeposit'] : null,
        status: b['status'] as LeaseStatus,
        renewalOption: typeof b['renewalOption'] === 'boolean' ? b['renewalOption'] : false,
        breakOption: typeof b['breakOption'] === 'boolean' ? b['breakOption'] : false,
        vatIncluded: typeof b['vatIncluded'] === 'boolean' ? b['vatIncluded'] : false,
      },
    })

    return Response.json({ data: lease }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ошибка создания договора' }, { status: 500 })
  }
}
