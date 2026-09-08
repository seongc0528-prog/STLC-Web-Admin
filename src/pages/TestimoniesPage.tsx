import { useCrud } from '../hooks/useCrud'

type Testimony = {
  id: string
  title: string
  content: string
  views: number
  is_active: boolean
  created_at: string
}

export function TestimoniesPage() {
  const { list, update, remove } = useCrud<Testimony>('testimonies')

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">은혜 간증 모더레이션</h2>
      <p className="mb-4 text-sm text-gray-500">글 작성은 회원이 홈페이지에서 직접 합니다.</p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="px-2 py-2">제목</th>
            <th className="px-2 py-2">조회수</th>
            <th className="px-2 py-2">게시</th>
            <th className="px-2 py-2">등록일</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {list.data?.map((t) => (
            <tr key={t.id} className="border-b border-gray-100">
              <td className="px-2 py-2">{t.title}</td>
              <td className="px-2 py-2">{t.views}</td>
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={t.is_active}
                  onChange={(e) => update.mutate({ id: t.id, values: { is_active: e.target.checked } })}
                />
              </td>
              <td className="px-2 py-2">{new Date(t.created_at).toLocaleDateString()}</td>
              <td className="px-2 py-2 text-right">
                <button
                  onClick={() => confirm('삭제하시겠습니까?') && remove.mutate(t.id)}
                  className="text-red-600 hover:underline"
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.length === 0 && <p className="py-6 text-center text-sm text-gray-400">간증 글이 없습니다.</p>}
    </div>
  )
}
