'use client'

import { useEffect, useState } from 'react'
import { formatPct, formatRub } from '@/lib/utils/format'
import type { Trace, TraceOperand, TraceUnit } from '@/lib/types'

// V4.9.1 — модалка раскладки расчёта («паспорт» цифры).
// Открывается двойным кликом на любую цифру с прикреплённым Trace в таблицах
// (CashflowTable, CashRollTable, NAVBreakdownTable), метриках над таблицей,
// карточках дашборда и DCF-блоке.
//
// Поведение:
//   - Заголовок + формула (trace.formula) + список операндов + итог (= trace.value).
//   - Операнд со своим trace кликабельный (стрелка справа) — открывает под-раскладку
//     поверх текущей через внутренний стек навигации; кнопка «← Назад» возвращает.
//   - Закрытие: крестик, клик вне области, Escape.
//
// V4.9.3 — режим 'cashflow': операнды рендерятся как таблица «период · поток ·
// накопленно». Итог считается как formatPct (используется для IRR).

export type CalcDetailsMode = 'default' | 'cashflow'

type Props = {
  trace: Trace
  title: string
  onClose: () => void
  mode?: CalcDetailsMode
}

type Frame = {
  trace: Trace
  title: string
  mode: CalcDetailsMode
}

function formatValue(value: number, unit?: TraceUnit): string {
  if (unit === '₽') return formatRub(value)
  const formatted = value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
  if (unit === '%')    return `${formatted} %`
  if (unit === 'мес')  return `${formatted} мес`
  if (unit === 'лет')  return `${formatted} лет`
  if (unit === 'м²')   return `${formatted} м²`
  return formatted
}

export function CalcDetails({ trace, title, onClose, mode = 'default' }: Props) {
  const [stack, setStack] = useState<Frame[]>([{ trace, title, mode }])

  const current = stack[stack.length - 1]!

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function openOperand(op: TraceOperand) {
    if (!op.trace) return
    // Под-раскладка операнда — всегда дефолтный режим (cashflow-таблица — только
    // на верхнем уровне IRR).
    setStack(prev => [...prev, { trace: op.trace!, title: op.label, mode: 'default' }])
  }

  function goBack() {
    setStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {stack.length > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="text-sm text-blue-600 hover:text-blue-800"
                aria-label="Назад"
              >
                ← Назад
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-3"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-gray-500 font-mono mb-4 break-words">
          {current.trace.formula}
        </p>

        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md">
          {current.trace.operands.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">
              Операндов нет — значение задано напрямую
            </div>
          ) : current.mode === 'cashflow' ? (
            <CashflowOperandsTable operands={current.trace.operands} onOpenOperand={openOperand} />
          ) : (
            current.trace.operands.map((op, i) => {
              const hasChild = !!op.trace
              return (
                <div
                  key={i}
                  onClick={() => openOperand(op)}
                  className={
                    'flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-0 ' +
                    (hasChild ? 'cursor-pointer hover:bg-blue-50/40' : '')
                  }
                  title={hasChild ? 'Открыть раскладку' : undefined}
                >
                  <div className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                    {op.label}
                  </div>
                  <div className="text-sm text-gray-900 font-medium tabular-nums whitespace-nowrap">
                    {formatValue(op.value, op.unit)}
                  </div>
                  <div className="w-4 flex justify-center text-gray-400">
                    {hasChild ? '›' : ''}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
          <span className="text-sm text-gray-500">Итог</span>
          <span className="text-base font-bold text-gray-900 tabular-nums">
            = {current.mode === 'cashflow' ? formatPct(current.trace.value) : formatValue(current.trace.value)}
          </span>
        </div>
      </div>
    </div>
  )
}

// V4.9.3 — таблица «период · поток · накопленно» для раскладки IRR.
function CashflowOperandsTable({
  operands,
  onOpenOperand,
}: {
  operands: TraceOperand[]
  onOpenOperand: (op: TraceOperand) => void
}) {
  let cumulative = 0
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 sticky top-0">
        <tr className="text-xs text-gray-500 uppercase tracking-wide">
          <th className="text-left px-3 py-1.5 font-medium">Период</th>
          <th className="text-right px-3 py-1.5 font-medium">Поток</th>
          <th className="text-right px-3 py-1.5 font-medium">Накопленно</th>
          <th className="w-6" />
        </tr>
      </thead>
      <tbody>
        {operands.map((op, i) => {
          cumulative += op.value
          const hasChild = !!op.trace
          return (
            <tr
              key={i}
              onClick={() => onOpenOperand(op)}
              className={
                'border-b border-gray-100 last:border-0 ' +
                (hasChild ? 'cursor-pointer hover:bg-blue-50/40' : '')
              }
              title={hasChild ? 'Открыть раскладку' : undefined}
            >
              <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{op.label}</td>
              <td className={'px-3 py-1.5 text-right tabular-nums whitespace-nowrap ' + (op.value < 0 ? 'text-red-600' : 'text-gray-900')}>
                {formatValue(op.value, op.unit)}
              </td>
              <td className={'px-3 py-1.5 text-right tabular-nums whitespace-nowrap ' + (cumulative < 0 ? 'text-red-500' : 'text-gray-500')}>
                {formatValue(cumulative, op.unit)}
              </td>
              <td className="text-gray-400 text-center pr-2">{hasChild ? '›' : ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
