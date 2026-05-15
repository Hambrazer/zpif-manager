import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { calcWAULT } from '@/lib/calculations/metrics'
import { FundPage } from './FundPage'

type Props = { params: { id: string } }

export default async function FundDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const fund = await prisma.fund.findUnique({
    where: { id: params.id },
    include: {
      properties: {
        include: {
          property: { include: { leaseContracts: true } },
        },
        orderBy: { addedAt: 'asc' },
      },
    },
  })

  if (!fund) notFound()

  const now = new Date()

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
    properties: fund.properties.map(fp => {
      const p = fp.property
      const wault = calcWAULT(
        p.leaseContracts.map(l => ({
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
        now,
      )
      return {
        id: p.id,
        name: p.name,
        type: p.type as 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL',
        address: p.address,
        totalArea: p.totalArea,
        rentableArea: p.rentableArea,
        acquisitionPrice: p.acquisitionPrice,
        ownershipPct: fp.ownershipPct,
        // V3.9.2: для Portfolio Overview отчёта
        exitCapRate: p.exitCapRate,
        purchaseDate: p.purchaseDate?.toISOString() ?? null,
        saleDate: p.saleDate?.toISOString() ?? null,
        wault,
      }
    }),
  }

  return <FundPage fund={data} />
}
