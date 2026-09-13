import { CrudPage } from '../components/CrudPage'
import { nearestSunday } from '../lib/date'

// 주보(PDF)는 별도 메뉴(/bulletins, bulletins 테이블)에서 관리한다.
export function SermonsPage() {
  return (
    <CrudPage
      table="sermons"
      title="주일설교 · 수요예배"
      orderBy="published_at"
      createLabel="+ 새 설교 올리기"
      fields={[
        {
          key: 'published_at',
          label: '설교일',
          type: 'date',
          timestamp: true,
          required: true,
          defaultValue: nearestSunday,
        },
        {
          key: 'service_type',
          label: '구분',
          type: 'select',
          required: true,
          defaultValue: () => 'sunday',
          options: [
            { value: 'sunday', label: '주일 설교' },
            { value: 'wednesday', label: '수요 예배' },
          ],
        },
        { key: 'title', label: '제목', type: 'text', required: true },
        { key: 'title_en', label: '제목(영문)', type: 'text', hideInList: true },
        { key: 'preacher', label: '설교자', type: 'text' },
        { key: 'scripture', label: '본문', type: 'text' },
        { key: 'summary', label: '설교 전문', type: 'textarea', rows: 16, hideInList: true },
        { key: 'video_url', label: '영상 URL', type: 'text', hideInList: true },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
