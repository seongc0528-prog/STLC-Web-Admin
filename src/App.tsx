import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/AdminLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PagePlaceholder } from './components/PagePlaceholder'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="church-info" element={<PagePlaceholder title="교회 소개 관리" description="위임목사·섬기는사람들·예배안내·연혁·오시는길" />} />
        <Route path="sermons" element={<PagePlaceholder title="주일설교 · 수요예배 관리" />} />
        <Route path="praise" element={<PagePlaceholder title="찬양 영상 관리" />} />
        <Route path="photos" element={<PagePlaceholder title="행사 사진 관리" />} />
        <Route path="testimonies" element={<PagePlaceholder title="은혜 간증 모더레이션" />} />
        <Route path="mission-news" element={<PagePlaceholder title="선교 소식 관리" />} />
        <Route path="notices" element={<PagePlaceholder title="교회 소식 관리" />} />
        <Route path="bulletins" element={<PagePlaceholder title="주보 관리" />} />
        <Route path="resources" element={<PagePlaceholder title="자료실 관리" />} />
        <Route path="donations" element={<PagePlaceholder title="헌금 내역 조회" />} />
        <Route path="education" element={<PagePlaceholder title="교육 신청 관리" description="직분자 제자훈련 · 대학청년 · 주일학교" />} />
        <Route path="members" element={<PagePlaceholder title="회원 관리" description="가입 승인 · 역할 변경" />} />
        <Route path="push" element={<PagePlaceholder title="푸시 발송" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
