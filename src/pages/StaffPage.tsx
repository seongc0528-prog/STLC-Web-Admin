import { CrudPage } from '../components/CrudPage'

export function StaffPage() {
  return (
    <CrudPage
      table="staff"
      title="섬기는 사람들 · 위임목사 소개"
      orderBy="sort_order"
      fields={[
        { key: 'name', label: '이름', type: 'text', required: true },
        { key: 'name_en', label: '이름(영문)', type: 'text' },
        { key: 'position', label: '직분', type: 'text' },
        { key: 'position_en', label: '직분(영문)', type: 'text' },
        { key: 'bio', label: '소개', type: 'textarea' },
        { key: 'photo_url', label: '사진 URL', type: 'text' },
        { key: 'is_senior_pastor', label: '위임목사 여부', type: 'boolean' },
        { key: 'sort_order', label: '정렬 순서', type: 'number' },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
