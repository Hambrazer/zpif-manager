import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { calcWAULT } from '@/lib/calculations/metrics'
import { PropertyPage } from './PropertyPage'

type Props = { params: { id: string } }

export default async function PropertyDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const property = await prisma.property.findUnique({
    where: { id: params.id },
    include: {
      fund: { select: { id: true, name: true, startDate: true, endDate: true } },
      leaseContracts: { orderBy: { startDate: 'asc' } },
    },
  })

  if (!property) notFound()

  const wault = calcWAULT(
    property.leaseContracts.map(l => ({
      id: l.id,
      tenantName: l.tenantName,
      area: l.area,
      baseRent: l.baseRent,
      startDate: l.startDate,
      endDate: l.endDate,
      indexationType: l.indexationType as 'CPI' | 'FIXED' | 'NONE',
      indexationRate: l.indexationRate,
      opexReimbursementRate: l.opexReimbursementRate,
      opexReimbursementIndexationType: l.opexReimbursementIndexationType as 'CPI' | 'FIXED' | 'NONE',
      opexReimbursementIndexationRate: l.opexReimbursementIndexationRate,
      status: l.status as 'ACTIVE' | 'EXPIRED' | 'TERMINATING',
    })),
    new Date()
  )

  const data = {
    id: property.id,
    fundId: property.fund.id,
    fundName: property.fund.name,
    fundStartDate: property.fund.startDate.toISOString(),
    fundEndDate: property.fund.endDate.toISOString(),
    name: property.name,
    type: property.type as 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL',
    address: property.address,
    totalArea: property.totalArea,
    rentableArea: property.rentableArea,
    acquisitionPrice: property.acquisitionPrice,
    purchaseDate: property.purchaseDate?.toISOString() ?? null,
    saleDate: property.saleDate?.toISOString() ?? null,
    exitCapRate: property.exitCapRate,
    wault,
    leaseContracts: property.leaseContracts.map(l => ({
      id: l.id,
      tenantName: l.tenantName,
      area: l.area,
      baseRent: l.baseRent,
      startDate: l.startDate.toISOString(),
      endDate: l.endDate.toISOString(),
      indexationType: l.indexationType as 'CPI' | 'FIXED' | 'NONE',
      indexationRate: l.indexationRate,
      firstIndexationDate: l.firstIndexationDate?.toISOString() ?? null,
      indexationFrequency: l.indexationFrequency,
      opexReimbursementRate: l.opexReimbursementRate,
      opexReimbursementIndexationType: l.opexReimbursementIndexationType as 'CPI' | 'FIXED' | 'NONE',
      opexReimbursementIndexationRate: l.opexReimbursementIndexationRate,
      opexFirstIndexationDate: l.opexFirstIndexationDate?.toISOString() ?? null,
      opexIndexationFrequency: l.opexIndexationFrequency,
      securityDeposit: l.securityDeposit,
      status: l.status as 'ACTIVE' | 'EXPIRED' | 'TERMINATING',
      renewalOption: l.renewalOption,
      breakOption: l.breakOption,
      vatIncluded: l.vatIncluded,
    })),
  }

  return <PropertyPage property={data} />
}
