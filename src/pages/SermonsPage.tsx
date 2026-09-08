import { CrudPage } from '../components/CrudPage'

export function SermonsPage() {
  return (
    <CrudPage
      table="sermons"
      title="주일설교 · 수요예배 · 주보"
      orderBy="published_at"
      fields={[
        {
          key: 'service_type',
          label: '구분',
          type: 'select',
          required: true,
          options: [
            { value: 'sunday', label: '주일 설교' },
            { value: 'wednesday', label: '수요 예배' },
          ],
        },
        { key: 'title', label: '제목', type: 'text', required: true },
        { key: 'title_en', label: '제목(영문)', type: 'text' },
        { key: 'preacher', label: '설교자', type: 'text' },
        { key: 'scripture', label: '본문', type: 'text' },
        { key: 'summary', label: '요약', type: 'textarea' },
        { key: 'video_url', label: '영상 URL', type: 'text' },
        { key: 'file_url', label: '주보/첨부파일 URL', type: 'text' },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
