import { Routes, Route } from "react-router-dom";
import Staff from "./Staff";
import StaffDetail from "./StaffDetail";
import Courses from "./Courses";
import CourseDetail from "./CourseDetail";
import AcademyAdmin from "./Academy";
import Analytics from "./Analytics";
import AdminStub from "./Stub";

function Dashboard() { return <AdminStub title="Панель управления" icon="🏠" />; }

export default function Admin() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="staff" element={<Staff />} />
      <Route path="staff/:id" element={<StaffDetail />} />
      <Route path="courses" element={<Courses />} />
      <Route path="courses/:id" element={<CourseDetail />} />
      <Route path="academy/*" element={<AcademyAdmin />} />
      <Route path="analytics" element={<Analytics />} />
      <Route path="services/*" element={<AdminStub title="Допуски к услугам" icon="🔑" />} />
      <Route path="subscriptions/*" element={<AdminStub title="Подписки и промокоды" icon="💳" />} />
      <Route path="settings/*" element={<AdminStub title="Организации и настройки" icon="🏢" />} />
      <Route path="audit/*" element={<AdminStub title="Журнал аудита" icon="📋" />} />
      <Route path="announcements/*" element={<AdminStub title="Рассылки" icon="📢" />} />
      <Route path="integrations/*" element={<AdminStub title="Интеграции" icon="🔗" />} />
    </Routes>
  );
}
