import { type Prisma, TerminalType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const scenario = await prisma.scenarioAssumption.findUniqueOrThrow({ where: { id: params.id } })
    return Response.json({ data: scenario })
  } catch {
    return Response.json({ error: 'Сценарий не найден' }, { status: 404 })
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
    const upd: Prisma.ScenarioAssumptionUpdateInput = {}

    if (typeof b['vacancyRate'] === 'number') upd.vacancyRate = b['vacancyRate']
    if (typeof b['rentGrowthRate'] === 'number') upd.rentGrowthRate = b['rentGrowthRate']
    if (typeof b['opexGrowthRate'] === 'number') upd.opexGrowthRate = b['opexGrowthRate']
    if (typeof b['cpiRate'] === 'number') upd.cpiRate = b['cpiRate']
    if (typeof b['terminalType'] === 'string') upd.terminalType = b['terminalType'] as TerminalType
    if ('exitCapRate' in b) upd.exitCapRate = typeof b['exitCapRate'] === 'number' ? b['exitCapRate'] : null
    if ('gordonGrowthRate' in b) upd.gordonGrowthRate = typeof b['gordonGrowthRate'] === 'number' ? b['gordonGrowthRate'] : null
    if (typeof b['projectionYears'] === 'number') upd.projectionYears = b['projectionYears']

    const scenario = await prisma.scenarioAssumption.update({ where: { id: params.id }, data: upd })
    return Response.json({ data: scenario })
  } catch {
    return Response.json({ error: 'Сценарий не найден' }, { status: 404 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    await prisma.scenarioAssumption.delete({ where: { id: params.id } })
    return Response.json({ data: null })
  } catch {
    return Response.json({ error: 'Сценарий не найден' }, { status: 404 })
  }
}
