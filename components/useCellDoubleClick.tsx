'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { CalcDetails, type CalcDetailsMode } from './CalcDetails'
import type { Trace } from '@/lib/types'

// V4.9.2 — хук подключения двойного клика «ячейка → раскладка».
//
// Вызывается один раз в компоненте-таблице/блоке метрик. Возвращает:
//   - open(trace, title, opts?) — функция-открыватель (вешается на onDoubleClick).
//     opts.mode='cashflow' — таблица «период · поток · накопленно» (V4.9.3, для IRR).
//   - modal — JSX модалки CalcDetails (рендерится один раз внизу компонента;
//     стек навигации между под-расскладками живёт внутри самой модалки)
//
// Использование:
//   const { open, modal } = useCellDoubleClick()
//   return (
//     <>
//       <table>...
//         <td onDoubleClick={() => trace && open(trace, `${label} · ${period}`)}>...</td>
//       </table>
//       {modal}
//     </>
//   )

type OpenOpts = { mode?: CalcDetailsMode }
type OpenFn = (trace: Trace, title: string, opts?: OpenOpts) => void

type State = { trace: Trace; title: string; mode: CalcDetailsMode }

export function useCellDoubleClick(): { open: OpenFn; modal: ReactNode } {
  const [state, setState] = useState<State | null>(null)

  const open = useCallback<OpenFn>((trace, title, opts) => {
    setState({ trace, title, mode: opts?.mode ?? 'default' })
  }, [])

  const modal = state
    ? <CalcDetails trace={state.trace} title={state.title} mode={state.mode} onClose={() => setState(null)} />
    : null

  return { open, modal }
}

// Хелпер для единообразного заголовка раскладки: «NOI · фев 2026».
const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
] as const

export function periodTitle(label: string, period: { year: number; month: number }): string {
  const m = MONTHS_SHORT[period.month - 1] ?? String(period.month)
  return `${label} · ${m} ${period.year}`
}

// Tailwind-классы, единые для всех trace-ячеек: курсор и подсветка при hover.
export const TRACE_CELL_CLS = 'cursor-help hover:bg-blue-50/40'
