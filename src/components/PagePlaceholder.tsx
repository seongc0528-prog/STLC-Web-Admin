export function PagePlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-6 rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
        구현 예정 (Supabase 테이블 연동 전)
      </div>
    </div>
  )
}
