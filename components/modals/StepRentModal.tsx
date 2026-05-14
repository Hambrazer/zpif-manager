'use client'

import { useEffect, useState } from 'react'

// V3.6.4 — модальное окно «Лестничная ставка».
// POST сохраняет массив ступеней целиком (см. /api/leases/[id]/step-rent).

type StepRow = {
  startDate: string  // ISO date 'YYYY-MM-DD' для input type="date"
  endDate: string
  rentRate: string
  indexAfterEnd: boolean
}

type StepFromApi = {
  id: string
  startDate: string
  endDate: string
  rentRate: number
  indexAfterEnd: boolean
}

type Props = {
  leaseId: string
  tenantName: string
  onClose: () => void
  onSaved: () => void
}

const inputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'

function emptyRow(): StepRow {
  return { startDate: '', endDate: '', rentRate: '', indexAfterEnd: false }
}

export function StepRentModal({ leaseId, tenantName, onClose, onSaved }: Props) {
  const [rows, setRows]         = useState<StepRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/leases/${leaseId}/step-rent`)
      .then(async res => {
        const json = await res.json() as { data?: StepFromApi[]; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Ошибка загрузки')
        const steps = (json.data ?? []).map(s => ({
          startDate: s.startDate.slice(0, 10),
          endDate:   s.endDate.slice(0, 10),
          rentRate:  String(s.rentRate),
          indexAfterEnd: s.indexAfterEnd,
        }))
        setRows(steps)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [leaseId])

  function updateRow(i: number, patch: Partial<StepRow>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setError(null)

    // Валидация
    const cleaned: { startDate: string; endDate: string; rentRate: number; indexAfterEnd: boolean }[] = []
    for (const [i, r] of rows.entries()) {
      if (!r.startDate || !r.endDate) {
        setError(`Ступень ${i + 1}: укажите даты начала и окончания`); return
      }
      if (r.endDate <= r.startDate) {
        setError(`Ступень ${i + 1}: дата окончания должна быть позже даты начала`); return
      }
      const rate = parseFloat(r.rentRate)
      if (isNaN(rate) || rate < 0) {
        setError(`Ступень ${i + 1}: укажите корректную ставку`); return
      }
      cleaned.push({
        startDate: r.startDate,
        endDate:   r.endDate,
        rentRate:  rate,
        indexAfterEnd: r.indexAfterEnd,
      })
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/leases/${leaseId}/step-rent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: cleaned }),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        setError(json.error ?? 'Ошибка сохранения'); return
      }
      onSaved()
    } catch {
      setError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Лестничная ставка — {tenantName}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Если в периоде есть ступень — используется её ставка без индексации. Если период не покрыт ступенью и у последней <em>«индексировать после окончания»</em> отмечено — применяется накопленная индексация от ставки этой ступени.
        </p>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Загрузка…</div>
        ) : (
          <div className="space-y-3">
            {rows.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-md">
                Ступеней нет — нажмите «+ Добавить ступень»
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500 font-medium uppercase tracking-wide">
                      <th className="text-left px-2 py-2 w-8">#</th>
                      <th className="text-left px-2 py-2">Дата начала</th>
                      <th className="text-left px-2 py-2">Дата окончания</th>
                      <th className="text-left px-2 py-2">Ставка, ₽/м²/год</th>
                      <th className="text-center px-2 py-2">Индексировать после окончания</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={r.startDate}
                            onChange={e => updateRow(i, { startDate: e.target.value })}
                            className={inputCls}
                            disabled={saving}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={r.endDate}
                            onChange={e => updateRow(i, { endDate: e.target.value })}
                            className={inputCls}
                            disabled={saving}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={r.rentRate}
                            onChange={e => updateRow(i, { rentRate: e.target.value })}
                            min="0"
                            step="1"
                            className={inputCls}
                            disabled={saving}
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={r.indexAfterEnd}
                            onChange={e => updateRow(i, { indexAfterEnd: e.target.checked })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            disabled={saving}
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            disabled={saving}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                            title="Удалить ступень"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              onClick={addRow}
              disabled={saving}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              + Добавить ступень
            </button>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
