import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/AdminLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { ChurchInfoPage } from './pages/ChurchInfoPage'
import { StaffPage } from './pages/StaffPage'
import { HistoryPage } from './pages/HistoryPage'
import { SermonsPage } from './pages/SermonsPage'
import { PraisePage } from './pages/PraisePage'
import { PhotosPage } from './pages/PhotosPage'
import { TestimoniesPage } from './pages/TestimoniesPage'
import { MissionNewsPage } from './pages/MissionNewsPage'
import { NoticesPage } from './pages/NoticesPage'
import { ResourcesPage } from './pages/ResourcesPage'
import { DonationsPage } from './pages/DonationsPage'
import { EducationPage } from './pages/EducationPage'
import { MembersPage } from './pages/MembersPage'
import { PushPage } from './pages/PushPage'
import { ScheduledPushPage } from './pages/ScheduledPushPage'
import { DailyVersesPage } from './pages/DailyVersesPage'

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
        <Route path="church-info" element={<ChurchInfoPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="sermons" element={<SermonsPage />} />
        <Route path="praise" element={<PraisePage />} />
        <Route path="photos" element={<PhotosPage />} />
        <Route path="testimonies" element={<TestimoniesPage />} />
        <Route path="mission-news" element={<MissionNewsPage />} />
        <Route path="notices" element={<NoticesPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="donations" element={<DonationsPage />} />
        <Route path="education" element={<EducationPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="push" element={<PushPage />} />
        <Route path="scheduled-push" element={<ScheduledPushPage />} />
        <Route path="daily-verses" element={<DailyVersesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
