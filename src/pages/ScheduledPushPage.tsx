import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCrud } from '../hooks/useCrud'

type Schedule = {
  id: string
  name: string
  kind: 'daily_verse' | 'text'
  title: string
  body: string | null
  url: string
  enabled: boolean
  send_time: string
  timezone: string
  days_of_week: number[] | null
  last_sent_on: string | null
  last_run_at: string | null
}

type Verse = { order_no: number; type: string; text_kr: string; text_en: string | null }

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const EMPTY: Partial<Schedule> = {
  name: '',
  kind: 'daily_verse',
  title: '오늘의 말씀',
  body: '',
  url: '/daily-verse',
  enabled: true,
  send_time: '07:00',
  timezone: 'Australia/Sydney',
  days_of_week: null,
}

/** 'HH:MM:SS' (DB) ↔ 'HH:MM' (input type="time") */
const toInputTime = (t: string) => (t ?? '').slice(0, 5)

function localDate(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function ScheduledPushPage() {
  const { list, create, update, remove } = useCrud<Schedule>('scheduled_pushes', 'created_at')
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null)
  const [values, setValues] = useState<Partial<Schedule>>(EMPTY)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Verse | null>(null)

  // 오늘 나갈 말씀을 관리자도 미리 확인할 수 있게 (발송 함수와 같은 RPC 사용)
  useEffect(() => {
    supabase
      .rpc('daily_verse_for', { d: localDate('Australia/Sydney') })
      .then(({ data }) => setPreview((Array.isArray(data) ? data[0] : data) ?? null))
  }, [])

  function startCreate() {
    setEditing('new')
    setValues(EMPTY)
  }

  function startEdit(row: Schedule) {
    setEditing(row)
    setValues({ ...row, send_time: toInputTime(row.send_time) })
  }

  function cancel() {
    setEditing(null)
    setValues(EMPTY)
  }

  function toggleDay(day: number) {
    const current = values.days_of_week ?? []
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    setValues((v) => ({ ...v, days_of_week: next.length === 0 ? null : next }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload: Partial<Schedule> = {
      ...values,
      body: values.kind === 'text' ? (values.body ?? '') : null,
      url: values.url || '/daily-verse',
    }
    try {
      if (editing === 'new') {
        await create.mutateAsync(payload)
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, values: payload })
      }
      cancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 예약을 삭제하시겠습니까?')) return
    await remove.mutateAsync(id)
  }

  /** 예정 시각과 무관하게 즉시 1건 발송(테스트). last_sent_on 은 바뀌지 않아
   *  정규 발송은 그대로 예정 시각에 나간다. */
  async function handleTestSend(row: Schedule) {
    if (!confirm(`"${row.name}" 을(를) 지금 전체 발송합니다. 계속할까요?`)) return
    setSendingId(row.id)
    setError(null)
    setMessage(null)

    const { data, error } = await supabase.functions.invoke('run-scheduled-push', {
      body: { scheduleId: row.id, force: true },
    })

    setSendingId(null)
    if (error) {
      setError(error.message)
      return
    }
    const r = data?.results?.[0]
    setMessage(
      r
        ? `발송 완료: 성공 ${r.successCount} / 실패 ${r.failureCount} (전체 ${r.total}건)`
        : '발송할 대상이 없습니다.',
    )
    queryClient.invalidateQueries({ queryKey: ['push_logs'] })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">예약 푸시 발송</h2>
        <button
          onClick={startCreate}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          예약 추가
        </button>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        지정한 시각이 되면 서버(크론)가 자동으로 전체 발송합니다. &quot;데일리 말씀&quot; 종류는
        그날의 말씀을 <span className="font-medium">데일리 말씀</span> 목록에서 자동으로 골라
        본문에 담습니다.
      </p>

      {preview && (
        <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-4 text-sm">
          <p className="mb-1 font-medium text-gray-700">오늘 발송될 말씀 (시드니 기준)</p>
          <p className="text-gray-900">
            #{preview.order_no} · {preview.text_kr}
          </p>
          {preview.text_en && <p className="mt-1 text-gray-500">{preview.text_en}</p>}
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-3 text-sm text-green-600">{message}</p>}

      {editing && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 flex max-w-lg flex-col gap-3 rounded border border-gray-200 p-4"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">예약 이름</span>
            <input
              value={values.name ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              required
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">종류</span>
            <select
              value={values.kind ?? 'daily_verse'}
              onChange={(e) => setValues((v) => ({ ...v, kind: e.target.value as Schedule['kind'] }))}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="daily_verse">데일리 말씀 (본문 자동)</option>
              <option value="text">고정 문구</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">알림 제목</span>
            <input
              value={values.title ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              required
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>

          {values.kind === 'text' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">알림 내용</span>
              <textarea
                value={values.body ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
                required
                rows={3}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">클릭 시 열 경로</span>
            <input
              value={values.url ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, url: e.target.value }))}
              placeholder="/daily-verse"
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">발송 시각</span>
              <input
                type="time"
                value={toInputTime(values.send_time ?? '07:00')}
                onChange={(e) => setValues((v) => ({ ...v, send_time: e.target.value }))}
                required
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">기준 시간대</span>
              <input
                value={values.timezone ?? 'Australia/Sydney'}
                onChange={(e) => setValues((v) => ({ ...v, timezone: e.target.value }))}
                required
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">요일 (전부 해제하면 매일)</span>
            <div className="flex gap-2">
              {DAY_LABELS.map((label, day) => {
                const on = values.days_of_week?.includes(day) ?? false
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`h-8 w-8 rounded text-sm ${
                      on ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.enabled ?? true}
              onChange={(e) => setValues((v) => ({ ...v, enabled: e.target.checked }))}
            />
            <span className="font-medium text-gray-700">사용</span>
          </label>

          <div className="flex gap-2">
            <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
              저장
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600"
            >
              취소
            </button>
          </div>
        </form>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="px-2 py-2">이름</th>
            <th className="px-2 py-2">종류</th>
            <th className="px-2 py-2">발송 시각</th>
            <th className="px-2 py-2">요일</th>
            <th className="px-2 py-2">사용</th>
            <th className="px-2 py-2">마지막 발송</th>
            <th className="px-2 py-2">관리</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((row) => (
            <tr key={row.id} className="border-b border-gray-100">
              <td className="px-2 py-2">{row.name}</td>
              <td className="px-2 py-2">{row.kind === 'daily_verse' ? '데일리 말씀' : '고정 문구'}</td>
              <td className="px-2 py-2">
                {toInputTime(row.send_time)}
                <span className="ml-1 text-xs text-gray-400">{row.timezone}</span>
              </td>
              <td className="px-2 py-2">
                {row.days_of_week?.length
                  ? row.days_of_week.map((d) => DAY_LABELS[d]).join(', ')
                  : '매일'}
              </td>
              <td className="px-2 py-2">{row.enabled ? '○' : '×'}</td>
              <td className="px-2 py-2">{row.last_sent_on ?? '-'}</td>
              <td className="flex gap-2 px-2 py-2">
                <button onClick={() => startEdit(row)} className="text-blue-600">
                  수정
                </button>
                <button
                  onClick={() => handleTestSend(row)}
                  disabled={sendingId === row.id}
                  className="text-gray-700 disabled:opacity-50"
                >
                  {sendingId === row.id ? '발송 중...' : '지금 발송'}
                </button>
                <button onClick={() => handleDelete(row.id)} className="text-red-600">
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-400">등록된 예약이 없습니다.</p>
      )}
    </div>
  )
}
