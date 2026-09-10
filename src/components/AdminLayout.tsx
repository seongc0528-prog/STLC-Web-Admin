import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const navItems = [
  { to: '/', label: '대시보드' },
  { to: '/church-info', label: '예배 안내 · 오시는 길' },
  { to: '/staff', label: '섬기는 사람들' },
  { to: '/history', label: '교회 연혁' },
  { to: '/sermons', label: '주일설교 · 수요예배 · 주보' },
  { to: '/praise', label: '찬양 영상' },
  { to: '/photos', label: '행사 사진' },
  { to: '/testimonies', label: '은혜 간증' },
  { to: '/mission-news', label: '선교 소식' },
  { to: '/notices', label: '교회 소식' },
  { to: '/resources', label: '자료실' },
  { to: '/donations', label: '헌금 내역' },
  { to: '/education', label: '교육 신청 관리' },
  { to: '/members', label: '회원 관리' },
  { to: '/push', label: '푸시 발송' },
  { to: '/scheduled-push', label: '예약 푸시 발송' },
  { to: '/daily-verses', label: '데일리 말씀' },
]

export function AdminLayout() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        <h1 className="mb-6 text-lg font-semibold">STLC Admin</h1>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleSignOut}
          className="mt-6 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          로그아웃
        </button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
