import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PipelinePage, type PipelineProperty } from './PipelinePage'

export default async function PipelinePageRoute() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const propertiesRaw = await prisma.property.findMany({
    include: {
      funds: { include: { fund: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const properties: PipelineProperty[] = propertiesRaw.map(p => ({
    id: p.id,
    name: p.name,
    address: p.address,
    type: p.type,
    rentableArea: p.rentableArea,
    pipelineStatus: p.pipelineStatus,
    acquisitionPrice: p.acquisitionPrice,
    purchaseDate: p.purchaseDate ? p.purchaseDate.toISOString() : null,
    funds: p.funds.map(fp => ({ id: fp.fund.id, name: fp.fund.name })),
  }))

  return <PipelinePage properties={properties} />
}
