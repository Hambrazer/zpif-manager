import { type Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

type Params = { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const item = await prisma.capexItem.findUniqueOrThrow({ where: { id: params.id } })
    return Response.json({ data: item })
  } catch {
    return Response.json({ error: 'Статья CAPEX не найдена' }, { status: 404 })
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
    const upd: Prisma.CapexItemUpdateInput = {}

    if (typeof b['name'] === 'string') upd.name = b['name']
    if (typeof b['amount'] === 'number') upd.amount = b['amount']
    if (typeof b['plannedDate'] === 'string') upd.plannedDate = new Date(b['plannedDate'])
    if (typeof b['notes'] === 'string') upd.notes = b['notes']
    else if (b['notes'] === null) upd.notes = null

    const item = await prisma.capexItem.update({ where: { id: params.id }, data: upd })
    return Response.json({ data: item })
  } catch {
    return Response.json({ error: 'Статья CAPEX не найдена' }, { status: 404 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    await prisma.capexItem.delete({ where: { id: params.id } })
    return Response.json({ data: null })
  } catch {
    return Response.json({ error: 'Статья CAPEX не найдена' }, { status: 404 })
  }
}
