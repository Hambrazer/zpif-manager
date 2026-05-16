'use client'

import { useEffect } from 'react'

// V4.10.1 — модалка выбора способа добавления объекта в фонд.
// Открывается с блока «Объекты фонда» по клику «+ Добавить объект» и предлагает:
//   - «Из pipeline» → AddPropertyToFundModal (привязать существующий APPROVED-объект)
//   - «Новый объект» → CreatePropertyInFundModal (создать новый + привязать) — V4.10.2
//
// onSelectNew опциональный: пока компонент CreatePropertyInFundModal не реализован
// (V4.10.2), родитель не передаёт колбэк — кнопка автоматически disabled с подписью.

type Props = {
  onClose: () => void
  onSelectPipeline: () => void
  onSelectNew?: () => void
}

export function AddPropertyChoiceModal({ onClose, onSelectPipeline, onSelectNew }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Добавить объект</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">Выберите способ.</p>

        <div className="grid grid-cols-1 gap-3">
          <ChoiceButton
            title="Из pipeline"
            description="Привязать одобренный объект из базы Pipeline."
            onClick={onSelectPipeline}
          />
          <ChoiceButton
            title="Новый объект"
            description="Создать новый объект сразу в фонде и открыть для дозаполнения."
            {...(onSelectNew ? { onClick: onSelectNew } : {})}
          />
        </div>
      </div>
    </div>
  )
}

function ChoiceButton({
  title,
  description,
  onClick,
  disabledHint,
}: {
  title: string
  description: string
  onClick?: () => void
  disabledHint?: string
}) {
  const disabled = !onClick
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full text-left rounded-lg border px-4 py-3 transition-colors',
        disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer',
      ].join(' ')}
    >
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      {disabled && disabledHint && (
        <p className="text-[11px] text-gray-400 mt-1 italic">{disabledHint}</p>
      )}
    </button>
  )
}
