import { useState } from 'react'
import { CrudPage } from '../components/CrudPage'
import { useCrud } from '../hooks/useCrud'

type Application = {
  id: string
  program_id: string
  applicant_name: string
  phone: string | null
  email: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

function ApplicationsSection() {
  const { list, update } = useCrud<Application>('education_applications')
  const [filter, setFilter] = useState<string>('all')

  const rows = list.data?.filter((a) => filter === 'all' || a.status === filter) ?? []

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">교육 신청 접수 현황</h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="all">전체</option>
          <option value="pending">대기중</option>
          <option value="approved">승인</option>
          <option value="rejected">거절</option>
        </select>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="px-2 py-2">신청자</th>
            <th className="px-2 py-2">연락처</th>
            <th className="px-2 py-2">이메일</th>
            <th className="px-2 py-2">상태</th>
            <th className="px-2 py-2">신청일</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-gray-100">
              <td className="px-2 py-2">{a.applicant_name}</td>
              <td className="px-2 py-2">{a.phone}</td>
              <td className="px-2 py-2">{a.email}</td>
              <td className="px-2 py-2">{a.status}</td>
              <td className="px-2 py-2">{new Date(a.created_at).toLocaleDateString()}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right">
                <button
                  onClick={() => update.mutate({ id: a.id, values: { status: 'approved' } })}
                  className="mr-3 text-green-600 hover:underline"
                >
                  승인
                </button>
                <button
                  onClick={() => update.mutate({ id: a.id, values: { status: 'rejected' } })}
                  className="text-red-600 hover:underline"
                >
                  거절
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-6 text-center text-sm text-gray-400">신청 내역이 없습니다.</p>}
    </div>
  )
}

export function EducationPage() {
  return (
    <div>
      <CrudPage
        table="education_programs"
        title="교육 프로그램 (직분자 제자훈련 · 대학청년 · 주일학교)"
        fields={[
          {
            key: 'category',
            label: '구분',
            type: 'select',
            required: true,
            options: [
              { value: 'officer_training', label: '직분자 제자훈련' },
              { value: 'young_adult', label: '대학청년' },
              { value: 'sunday_school', label: '주일학교' },
            ],
          },
          { key: 'title', label: '제목', type: 'text', required: true },
          { key: 'title_en', label: '제목(영문)', type: 'text' },
          { key: 'description', label: '설명', type: 'textarea' },
          { key: 'schedule_info', label: '일정 안내', type: 'text' },
          { key: 'is_active', label: '게시 여부', type: 'boolean' },
        ]}
      />
      <ApplicationsSection />
    </div>
  )
}
