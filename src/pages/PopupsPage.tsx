import { CrudPage } from '../components/CrudPage'
import { toChurchDate } from '../lib/date'

export function PopupsPage() {
  return (
    <CrudPage
      table="popups"
      title="홈 팝업"
      orderBy="starts_on"
      createLabel="+ 새 팝업 올리기"
      fields={[
        { key: 'title', label: '제목 (관리용 · 이미지 설명)', type: 'text', required: true },
        {
          key: 'image_url',
          label: '팝업 이미지 (JPG · PNG)',
          type: 'file',
          bucket: 'public-assets',
          accept: 'image/jpeg,image/png',
          required: true,
        },
        {
          key: 'link_url',
          label: '클릭 시 이동할 주소',
          type: 'text',
          help: "홈페이지 게시물은 주소창의 주소를 그대로 붙여넣거나 '/support/news'처럼 적으면 같은 화면에서 열립니다. 바깥 사이트(https://...)는 새 창으로 열립니다. 비워 두면 클릭해도 이동하지 않습니다.",
        },
        {
          key: 'starts_on',
          label: '게시 시작일',
          type: 'date',
          required: true,
          defaultValue: () => toChurchDate(new Date().toISOString()),
        },
        { key: 'ends_on', label: '게시 종료일 (비우면 계속)', type: 'date' },
        { key: 'sort_order', label: '순서 (작을수록 먼저)', type: 'number', hideInList: true },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
