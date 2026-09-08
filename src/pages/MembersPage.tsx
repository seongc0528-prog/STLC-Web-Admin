import { useCrud } from '../hooks/useCrud'

type Profile = {
  id: string
  name: string
  email: string
  phone: string | null
  role: 'member' | 'admin'
  is_active: boolean
  created_at: string
}

export function MembersPage() {
  const { list, update } = useCrud<Profile>('profiles')

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">회원 관리</h2>
      {list.isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="px-2 py-2">이름</th>
            <th className="px-2 py-2">이메일</th>
            <th className="px-2 py-2">전화번호</th>
            <th className="px-2 py-2">권한</th>
            <th className="px-2 py-2">활성</th>
            <th className="px-2 py-2">가입일</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((m) => (
            <tr key={m.id} className="border-b border-gray-100">
              <td className="px-2 py-2">{m.name}</td>
              <td className="px-2 py-2">{m.email}</td>
              <td className="px-2 py-2">{m.phone}</td>
              <td className="px-2 py-2">
                <select
                  value={m.role}
                  onChange={(e) =>
                    update.mutate({ id: m.id, values: { role: e.target.value as Profile['role'] } })
                  }
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={m.is_active}
                  onChange={(e) => update.mutate({ id: m.id, values: { is_active: e.target.checked } })}
                />
              </td>
              <td className="px-2 py-2">{new Date(m.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.length === 0 && <p className="py-6 text-center text-sm text-gray-400">회원이 없습니다.</p>}
    </div>
  )
}
