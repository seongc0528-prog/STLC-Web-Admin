import { CrudPage } from '../components/CrudPage'

export function MissionNewsPage() {
  return (
    <CrudPage
      table="mission_news"
      title="선교 소식"
      fields={[
        { key: 'title', label: '제목', type: 'text', required: true },
        { key: 'title_en', label: '제목(영문)', type: 'text' },
        { key: 'content', label: '내용', type: 'textarea', required: true },
        { key: 'content_en', label: '내용(영문)', type: 'textarea' },
        { key: 'thumbnail_url', label: '썸네일', type: 'file', bucket: 'public-assets' },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
