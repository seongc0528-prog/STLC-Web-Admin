import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCrud } from '../hooks/useCrud'

type PushLog = {
  id: string
  title: string
  body: string
  target: string
  sent_at: string
}

export function PushPage() {
  const { list } = useCrud<PushLog>('push_logs', 'sent_at')
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    setResult(null)

    const { data, error } = await supabase.functions.invoke('send-push', { body: { title, body: body } })

    setSending(false)
    if (error) {
      setError(error.message)
      return
    }
    setResult(`발송 완료: 성공 ${data.successCount} / 실패 ${data.failureCount} (전체 ${data.total}건)`)
    setTitle('')
    setBody('')
    queryClient.invalidateQueries({ queryKey: ['push_logs'] })
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">푸시 발송</h2>

      <form onSubmit={handleSubmit} className="mb-6 flex max-w-lg flex-col gap-3 rounded border border-gray-200 p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">제목</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">내용</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={3}
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && <p className="text-sm text-green-600">{result}</p>}
        <button
          type="submit"
          disabled={sending}
          className="w-fit rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? '발송 중...' : '전체 발송'}
        </button>
      </form>

      <h3 className="mb-2 text-lg font-semibold text-gray-900">발송 기록</h3>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="px-2 py-2">제목</th>
            <th className="px-2 py-2">내용</th>
            <th className="px-2 py-2">대상</th>
            <th className="px-2 py-2">발송일시</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((p) => (
            <tr key={p.id} className="border-b border-gray-100">
              <td className="px-2 py-2">{p.title}</td>
              <td className="px-2 py-2">{p.body}</td>
              <td className="px-2 py-2">{p.target}</td>
              <td className="px-2 py-2">{new Date(p.sent_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.length === 0 && <p className="py-6 text-center text-sm text-gray-400">발송 기록이 없습니다.</p>}
    </div>
  )
}
