import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCrud } from '../hooks/useCrud'

type Donation = {
  id: string
  member_id: string
  amount: number
  donation_type: string
  memo: string | null
  status: string
  created_at: string
}

type ProfileOption = { id: string; name: string; email: string }

export function DonationsPage() {
  const { list, create } = useCrud<Donation>('donations')
  const { data: members } = useQuery({
    queryKey: ['profiles', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id,name,email').order('name')
      if (error) throw error
      return data as ProfileOption[]
    },
  })

  const [memberId, setMemberId] = useState('')
  const [amount, setAmount] = useState('')
  const [donationType, setDonationType] = useState('tithe')
  const [memo, setMemo] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await create.mutateAsync({
      member_id: memberId,
      amount: Number(amount),
      donation_type: donationType,
      memo,
      status: 'completed',
    })
    setMemberId('')
    setAmount('')
    setMemo('')
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">헌금 내역</h2>
      <p className="mb-4 text-sm text-gray-500">
        결제 게이트웨이 연동 전까지는 관리자가 수기로 내역을 등록합니다.
      </p>

      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">회원</span>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            required
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="" disabled>
              선택
            </option>
            {members?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.email})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">금액</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">종류</span>
          <select
            value={donationType}
            onChange={(e) => setDonationType(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="tithe">십일조</option>
            <option value="thanksgiving">감사헌금</option>
            <option value="mission">선교헌금</option>
            <option value="building">건축헌금</option>
            <option value="other">기타</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">메모</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">
          등록
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="px-2 py-2">금액</th>
            <th className="px-2 py-2">종류</th>
            <th className="px-2 py-2">메모</th>
            <th className="px-2 py-2">상태</th>
            <th className="px-2 py-2">일시</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((d) => (
            <tr key={d.id} className="border-b border-gray-100">
              <td className="px-2 py-2">${Number(d.amount).toLocaleString()}</td>
              <td className="px-2 py-2">{d.donation_type}</td>
              <td className="px-2 py-2">{d.memo}</td>
              <td className="px-2 py-2">{d.status}</td>
              <td className="px-2 py-2">{new Date(d.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.length === 0 && <p className="py-6 text-center text-sm text-gray-400">내역이 없습니다.</p>}
    </div>
  )
}
