import { useState, type FormEvent } from 'react'
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
  const { list, create } = useCrud<PushLog>('push_logs', 'sent_at')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const { data: userData } = await supabase.auth.getUser()
    await create.mutateAsync({ title, body, target: 'all', sent_by: userData.user?.id } as Partial<PushLog>)
    setTitle('')
    setBody('')
  }

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">푸시 발송</h2>
      <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
        ⚠️ 아직 실제 FCM 발송 기능(Cloud Function)이 연결되지 않았습니다. 지금은 발송 기록만 저장됩니다 — FCM
        연동 완료 후 이 화면에서 실제 발송까지 동작하도록 이어서 개발할 예정입니다.
      </p>

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
        <button type="submit" className="w-fit rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">
          발송 기록 저장
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
