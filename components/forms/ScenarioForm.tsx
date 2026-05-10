'use client'

import { useState } from 'react'

type ScenarioType = 'BASE' | 'BULL' | 'BEAR'
type TerminalType = 'EXIT_CAP_RATE' | 'GORDON'

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  BASE: 'Базовый',
  BULL: 'Оптимистичный',
  BEAR: 'Пессимистичный',
}

const TERMINAL_LABELS: Record<TerminalType, string> = {
  EXIT_CAP_RATE: 'Ставка капитализации',
  GORDON: 'Модель Гордона',
}

type ScenarioData = {
  id: string
  propertyId: string
  scenarioType: ScenarioType
  vacancyRate: number
  rentGrowthRate: number
  opexGrowthRate: number
  discountRate: number
  cpiRate: number
  terminalType: TerminalType
  exitCapRate: number | null
  gordonGrowthRate: number | null
  projectionYears: number
}

type Props = {
  propertyId: string
  initialData?: ScenarioData
  onSuccess: (scenario: ScenarioData) => void
  onCancel?: () => void
}

type FormState = {
  scenarioType: ScenarioType
  vacancyRate: string
  rentGrowthRate: string
  opexGrowthRate: string
  discountRate: string
  cpiRate: string
  terminalType: TerminalType
  exitCapRate: string
  gordonGrowthRate: string
  projectionYears: string
}

function toFormState(data: ScenarioData): FormState {
  return {
    scenarioType: data.scenarioType,
    vacancyRate: String(data.vacancyRate * 100),
    rentGrowthRate: String(data.rentGrowthRate * 100),
    opexGrowthRate: String(data.opexGrowthRate * 100),
    discountRate: String(data.discountRate * 100),
    cpiRate: String(data.cpiRate * 100),
    terminalType: data.terminalType,
    exitCapRate: data.exitCapRate != null ? String(data.exitCapRate * 100) : '',
    gordonGrowthRate: data.gordonGrowthRate != null ? String(data.gordonGrowthRate * 100) : '',
    projectionYears: String(data.projectionYears),
  }
}

const emptyState: FormState = {
  scenarioType: 'BASE',
  vacancyRate: '',
  rentGrowthRate: '0',
  opexGrowthRate: '0',
  discountRate: '',
  cpiRate: '7',
  terminalType: 'EXIT_CAP_RATE',
  exitCapRate: '',
  gordonGrowthRate: '',
  projectionYears: '10',
}

export function ScenarioForm({ propertyId, initialData, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(
    initialData ? toFormState(initialData) : emptyState
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(initialData?.id)

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const vacancyRate = parseFloat(form.vacancyRate)
    const rentGrowthRate = parseFloat(form.rentGrowthRate)
    const opexGrowthRate = parseFloat(form.opexGrowthRate)
    const discountRate = parseFloat(form.discountRate)
    const cpiRate = parseFloat(form.cpiRate)
    const projectionYears = parseInt(form.projectionYears, 10)

    if (
      isNaN(vacancyRate) || vacancyRate < 0 ||
      isNaN(rentGrowthRate) ||
      isNaN(opexGrowthRate) ||
      isNaN(discountRate) || discountRate <= 0 ||
      isNaN(cpiRate) || cpiRate < 0 ||
      isNaN(projectionYears) || projectionYears < 1
    ) {
      setError('Заполните все обязательные поля корректными значениями')
      return
    }

    let exitCapRate: number | null = null
    let gordonGrowthRate: number | null = null

    if (form.terminalType === 'EXIT_CAP_RATE') {
      const rate = parseFloat(form.exitCapRate)
      if (isNaN(rate) || rate <= 0) {
        setError('Укажите ставку капитализации для расчёта терминальной стоимости')
        return
      }
      exitCapRate = rate / 100
    } else {
      const rate = parseFloat(form.gordonGrowthRate)
      if (isNaN(rate)) {
        setError('Укажите темп роста для модели Гордона')
        return
      }
      gordonGrowthRate = rate / 100
    }

    const body = {
      propertyId,
      scenarioType: form.scenarioType,
      vacancyRate: vacancyRate / 100,
      rentGrowthRate: rentGrowthRate / 100,
      opexGrowthRate: opexGrowthRate / 100,
      discountRate: discountRate / 100,
      cpiRate: cpiRate / 100,
      terminalType: form.terminalType,
      exitCapRate,
      gordonGrowthRate,
      projectionYears,
    }

    setLoading(true)
    try {
      const url = isEdit ? `/api/scenarios/${initialData!.id}` : '/api/scenarios'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json() as { data?: ScenarioData; error?: string }

      if (!res.ok) {
        setError(json.error ?? 'Ошибка сервера')
        return
      }

      onSuccess(json.data!)
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Сценарий <span className="text-red-500">*</span>
          </label>
          {isEdit ? (
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {SCENARIO_LABELS[form.scenarioType]}
            </p>
          ) : (
            <select
              value={form.scenarioType}
              onChange={e => set('scenarioType', e.target.value as ScenarioType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              disabled={loading}
            >
              {(Object.keys(SCENARIO_LABELS) as ScenarioType[]).map(s => (
                <option key={s} value={s}>{SCENARIO_LABELS[s]}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Горизонт прогноза, лет <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.projectionYears}
            onChange={e => set('projectionYears', e.target.value)}
            placeholder="10"
            min="1"
            max="30"
            step="1"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Вакансия, % <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.vacancyRate}
            onChange={e => set('vacancyRate', e.target.value)}
            placeholder="5"
            min="0"
            max="100"
            step="0.1"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ИПЦ, % <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.cpiRate}
            onChange={e => set('cpiRate', e.target.value)}
            placeholder="7"
            min="0"
            step="0.1"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Рост аренды сверх индексации, % <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.rentGrowthRate}
            onChange={e => set('rentGrowthRate', e.target.value)}
            placeholder="0"
            step="0.1"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Рост OPEX, % <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.opexGrowthRate}
            onChange={e => set('opexGrowthRate', e.target.value)}
            placeholder="0"
            step="0.1"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Ставка дисконтирования (WACC), % <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          value={form.discountRate}
          onChange={e => set('discountRate', e.target.value)}
          placeholder="16"
          min="0"
          step="0.1"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Метод терминальной стоимости <span className="text-red-500">*</span>
          </label>
          <select
            value={form.terminalType}
            onChange={e => set('terminalType', e.target.value as TerminalType)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            disabled={loading}
          >
            {(Object.keys(TERMINAL_LABELS) as TerminalType[]).map(t => (
              <option key={t} value={t}>{TERMINAL_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {form.terminalType === 'EXIT_CAP_RATE' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Выходная ставка капитализации, % <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.exitCapRate}
              onChange={e => set('exitCapRate', e.target.value)}
              placeholder="9"
              min="0"
              step="0.1"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Темп роста g (Гордон), % <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.gordonGrowthRate}
              onChange={e => set('gordonGrowthRate', e.target.value)}
              placeholder="3"
              step="0.1"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать сценарий'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
        )}
      </div>
    </form>
  )
}
