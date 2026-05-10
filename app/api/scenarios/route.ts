import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')

  try {
    const scenarios = await prisma.scenarioAssumption.findMany({
      ...(propertyId ? { where: { propertyId } } : {}),
      orderBy: { scenarioType: 'asc' },
    })
    return Response.json({ data: scenarios })
  } catch {
    return Response.json({ error: 'Ошибка получения сценариев' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body: unknown = await req.json()
    const b = body as Record<string, unknown>

    if (
      typeof body !== 'object' || body === null ||
      typeof b['propertyId'] !== 'string' ||
      typeof b['scenarioType'] !== 'string' ||
      typeof b['vacancyRate'] !== 'number' ||
      typeof b['rentGrowthRate'] !== 'number' ||
      typeof b['opexGrowthRate'] !== 'number' ||
      typeof b['cpiRate'] !== 'number' ||
      typeof b['terminalType'] !== 'string' ||
      typeof b['projectionYears'] !== 'number'
    ) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const scenario = await prisma.scenarioAssumption.create({
      data: {
        propertyId: b['propertyId'] as string,
        scenarioType: b['scenarioType'] as Parameters<typeof prisma.scenarioAssumption.create>[0]['data']['scenarioType'],
        vacancyRate: b['vacancyRate'] as number,
        rentGrowthRate: b['rentGrowthRate'] as number,
        opexGrowthRate: b['opexGrowthRate'] as number,
        cpiRate: b['cpiRate'] as number,
        terminalType: b['terminalType'] as Parameters<typeof prisma.scenarioAssumption.create>[0]['data']['terminalType'],
        exitCapRate: typeof b['exitCapRate'] === 'number' ? b['exitCapRate'] : null,
        gordonGrowthRate: typeof b['gordonGrowthRate'] === 'number' ? b['gordonGrowthRate'] : null,
        projectionYears: b['projectionYears'] as number,
      },
    })

    return Response.json({ data: scenario }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ошибка создания сценария' }, { status: 500 })
  }
}
