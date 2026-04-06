import { Routes, Route } from "react-router-dom";
import Staff from "./Staff";
import Courses from "./Courses";
import CourseDetail from "./CourseDetail";
import AcademyAdmin from "./Academy";

function Dashboard() { return <h2 style={{ color: "#fff", padding: 24 }}>Панель управления</h2>; }
function ServicesAdmin() { return <h2 style={{ color: "#fff", padding: 24 }}>Допуски к услугам</h2>; }
function Subscriptions() { return <h2 style={{ color: "#fff", padding: 24 }}>Подписки и промокоды</h2>; }
function Analytics() { return <h2 style={{ color: "#fff", padding: 24 }}>Аналитика</h2>; }
function Integrations() { return <h2 style={{ color: "#fff", padding: 24 }}>Интеграции</h2>; }
function Announcements() { return <h2 style={{ color: "#fff", padding: 24 }}>Рассылки</h2>; }

export default function Admin() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="staff/*" element={<Staff />} />
      <Route path="courses" element={<Courses />} />
      <Route path="courses/:id" element={<CourseDetail />} />
      <Route path="academy/*" element={<AcademyAdmin />} />
      <Route path="services/*" element={<ServicesAdmin />} />
      <Route path="subscriptions/*" element={<Subscriptions />} />
      <Route path="analytics/*" element={<Analytics />} />
      <Route path="integrations/*" element={<Integrations />} />
      <Route path="announcements/*" element={<Announcements />} />
    </Routes>
  );
}
