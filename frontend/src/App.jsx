import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Catalog from './pages/Catalog';
import CourseView from './pages/CourseView';
import LessonView from './pages/LessonView';
import TestView from './pages/TestView';
import Profile from './pages/Profile';
import MasterProfile from './pages/MasterProfile';
import KnowledgeBase from './pages/KnowledgeBase';
import KnowledgeArticle from './pages/KnowledgeArticle';
import Documents from './pages/Documents';
import DocumentView from './pages/DocumentView';
import AdminDashboard from './pages/AdminDashboard';
import Employees from './pages/admin/Employees';
import Studios from './pages/admin/Studios';
import Courses from './pages/admin/Courses';
import CourseDetail from './pages/admin/CourseDetail';
import Analytics from './pages/admin/Analytics';
import KnowledgeAdmin from './pages/admin/KnowledgeAdmin';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Catalog />} />
        <Route path="/course/:id" element={<CourseView />} />
        <Route path="/academy" element={<PlaceholderPage title="Академия" />} />
        <Route path="/calendar" element={<PlaceholderPage title="Календарь" />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/knowledge" element={<KnowledgeBase />} />
        <Route path="/knowledge/article/:id" element={<KnowledgeArticle />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/:id" element={<DocumentView />} />
      </Route>
      <Route
        path="/lesson/:id"
        element={
          <ProtectedRoute>
            <LessonView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/test/:lessonId"
        element={
          <ProtectedRoute>
            <TestView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/:userId"
        element={
          <ProtectedRoute minimumRole="senior_master">
            <MasterProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute minimumRole="manager">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/employees"
        element={
          <ProtectedRoute minimumRole="manager">
            <Employees />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/studios"
        element={
          <ProtectedRoute minimumRole="owner">
            <Studios />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/knowledge"
        element={
          <ProtectedRoute minimumRole="manager">
            <KnowledgeAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/courses"
        element={
          <ProtectedRoute minimumRole="manager">
            <Courses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/courses/:id"
        element={
          <ProtectedRoute minimumRole="manager">
            <CourseDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <ProtectedRoute minimumRole="manager">
            <Analytics />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PlaceholderPage({ title }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <h1 className="text-2xl font-bold text-gray-400">{title}</h1>
    </div>
  );
}
