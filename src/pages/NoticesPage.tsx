import { CrudPage } from '../components/CrudPage'

export function NoticesPage() {
  return (
    <CrudPage
      table="notices"
      title="공지사항"
      fields={[
        { key: 'title', label: '제목', type: 'text', required: true },
        { key: 'content', label: '내용', type: 'textarea', required: true },
        { key: 'attachment_url', label: '첨부파일', type: 'file', bucket: 'admin-only-uploads' },
        { key: 'pinned', label: '상단 고정', type: 'boolean' },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
