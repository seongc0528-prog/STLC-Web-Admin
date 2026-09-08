import { CrudPage } from '../components/CrudPage'

export function PraisePage() {
  return (
    <CrudPage
      table="praise_videos"
      title="찬양 영상"
      orderBy="published_at"
      fields={[
        { key: 'title', label: '제목', type: 'text', required: true },
        { key: 'title_en', label: '제목(영문)', type: 'text' },
        { key: 'video_url', label: '영상 URL', type: 'text', required: true },
        { key: 'thumbnail_url', label: '썸네일 URL', type: 'text' },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
