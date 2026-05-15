import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FundPage } from './FundPage'

type Props = { params: { id: string } }

export default async function FundDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const fund = await prisma.fund.findUnique({
    where: { id: params.id },
    include: {
      properties: { include: { property: true }, orderBy: { addedAt: 'asc' } },
    },
  })

  if (!fund) notFound()

  const data = {
    id: fund.id,
    name: fund.name,
    registrationNumber: fund.registrationNumber,
    startDate: fund.startDate.toISOString(),
    endDate: fund.endDate.toISOString(),
    totalEmission: fund.totalEmission,
    nominalUnitPrice: fund.nominalUnitPrice,
    totalUnits: fund.totalUnits,
    managementFeeRate: fund.managementFeeRate,
    fundExpensesRate: fund.fundExpensesRate,
    distributionPeriodicity: fund.distributionPeriodicity as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL',
    properties: fund.properties.map(fp => ({
      id: fp.property.id,
      name: fp.property.name,
      type: fp.property.type as 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL',
      address: fp.property.address,
      totalArea: fp.property.totalArea,
      rentableArea: fp.property.rentableArea,
      acquisitionPrice: fp.property.acquisitionPrice,
      ownershipPct: fp.ownershipPct,
    })),
  }

  return <FundPage fund={data} />
}
