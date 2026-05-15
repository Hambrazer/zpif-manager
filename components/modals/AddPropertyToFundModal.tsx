'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatRub } from '@/lib/utils/format'

// V3.8.4: модальное окно «Добавить объект из pipeline». Грузит список объектов
// со статусом APPROVED, даёт поиск по названию, выбор чекбоксом и поле %владения.

type ApprovedProperty = {
  id: string
  name: string
  address: string
  rentableArea: number
  acquisitionPrice: number | null
}

type Props = {
  fundId: string
  onClose: () => void
  onSuccess: () => void
}

type Selected = {
  // propertyId → ownershipPct
  [id: string]: number
}

export function AddPropertyToFundModal({ fundId, onClose, onSuccess }: Props) {
  const [properties, setProperties] = useState<ApprovedProperty[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Selected>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/properties?status=APPROVED')
      .then(r => r.json() as Promise<{ data?: unknown[]; error?: string }>)
      .then(json => {
        if (cancelled) return
        if (json.error || !json.data) {
          setLoadError(json.error ?? 'Не удалось загрузить объекты')
          return
        }
        const list: ApprovedProperty[] = json.data.map(raw => {
          const p = raw as Record<string, unknown>
          return {
            id: p['id'] as string,
            name: p['name'] as string,
            address: p['address'] as string,
            rentableArea: p['rentableArea'] as number,
            acquisitionPrice: (p['acquisitionPrice'] as number | null) ?? null,
          }
        })
        setProperties(list)
      })
      .catch(() => { if (!cancelled) setLoadError('Ошибка сети') })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!properties) return []
    const q = search.trim().toLowerCase()
    if (!q) return properties
    return properties.filter(p =>
      p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
    )
  }, [properties, search])

  function toggle(id: string) {
    setSelected(prev => {
      const next = { ...prev }
      if (id in next) delete next[id]
      else next[id] = 100
      return next
    })
  }

  function setOwnership(id: string, raw: string) {
    const v = parseFloat(raw)
    setSelected(prev => ({ ...prev, [id]: isNaN(v) ? 0 : v }))
  }

  const selectedCount = Object.keys(selected).length

  async function handleSubmit() {
    if (selectedCount === 0) return
    // Валидация значений
    for (const [id, pct] of Object.entries(selected)) {
      if (!(pct > 0 && pct <= 100)) {
        setSaveError(`Некорректный % владения для одного из объектов (${id.slice(0, 6)}…)`)
        return
      }
    }
    setSaving(true)
    setSaveError(null)
    try {
      // Привязки выполняются последовательно — каждая в своей транзакции на бэкенде.
      // Если одна не пройдёт — остальные уже выполненные не откатываются.
      const errors: string[] = []
      for (const [propertyId, ownershipPct] of Object.entries(selected)) {
        const res = await fetch(`/api/funds/${fundId}/properties`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, ownershipPct }),
        })
        const json = await res.json() as { error?: string }
        if (!res.ok) errors.push(json.error ?? 'Ошибка')
      }
      if (errors.length > 0) {
        setSaveError(errors.join('; '))
      } else {
        onSuccess()
      }
    } catch {
      setSaveError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Добавить объект из pipeline</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или адресу"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md">
          {properties === null && !loadError && (
            <div className="py-10 text-center text-sm text-gray-400">Загрузка…</div>
          )}
          {loadError && (
            <div className="py-10 text-center text-sm text-red-500">{loadError}</div>
          )}
          {properties !== null && filtered.length === 0 && !loadError && (
            <div className="py-10 text-center text-sm text-gray-400">
              {properties.length === 0
                ? 'Нет одобренных объектов в pipeline'
                : 'По запросу ничего не найдено'}
            </div>
          )}
          {filtered.map(p => {
            const isSelected = p.id in selected
            return (
              <label
                key={p.id}
                className={
                  'flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 ' +
                  (isSelected ? 'bg-blue-50/40' : '')
                }
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {p.address} · {p.rentableArea.toLocaleString('ru-RU')} м²
                    {p.acquisitionPrice !== null && ` · ${formatRub(p.acquisitionPrice)}`}
                  </p>
                </div>
                {isSelected && (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-gray-500">% владения:</span>
                    <input
                      type="number"
                      value={selected[p.id]}
                      onChange={e => setOwnership(p.id, e.target.value)}
                      onClick={e => e.preventDefault()}
                      min="0.01"
                      max="100"
                      step="0.01"
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </label>
            )
          })}
        </div>

        {saveError && (
          <p className="mt-3 text-sm text-red-600">{saveError}</p>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Выбрано: <span className="font-medium text-gray-700">{selectedCount}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || selectedCount === 0}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Добавление…' : 'Добавить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
