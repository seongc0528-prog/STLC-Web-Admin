import { CrudPage } from '../components/CrudPage'

export function ResourcesPage() {
  return (
    <CrudPage
      table="resources"
      title="자료실"
      fields={[
        { key: 'title', label: '제목', type: 'text', required: true },
        { key: 'description', label: '설명', type: 'textarea' },
        { key: 'file_url', label: '파일', type: 'file', bucket: 'admin-only-uploads' },
        { key: 'category', label: '분류', type: 'text' },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
