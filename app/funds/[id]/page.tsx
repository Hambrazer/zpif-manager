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
      properties: { orderBy: { createdAt: 'asc' } },
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
    properties: fund.properties.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type as 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL',
      address: p.address,
      totalArea: p.totalArea,
      rentableArea: p.rentableArea,
      acquisitionPrice: p.acquisitionPrice,
    })),
  }

  return <FundPage fund={data} />
}
