/**
 * Admin panel.
 *
 * Sub-routes:
 *   /admin                 — dashboard
 *   /admin/staff           — employee management (add, fire, assign roles)
 *   /admin/courses         — content management (courses, modules, lessons)
 *   /admin/academy         — academy management (schedule, attestations)
 *   /admin/services        — service permissions management
 *   /admin/subscriptions   — subscription and promo codes
 *   /admin/analytics       — statistics (branch / network)
 *   /admin/integrations    — integration configs (Yclients, Bitrix24)
 *   /admin/announcements   — system broadcasts
 *
 * Access level depends on role — UI shows only permitted sections.
 */
import { Routes, Route } from "react-router-dom";

function Dashboard() { return <h2>Панель управления</h2>; }
function Staff() { return <h2>Сотрудники</h2>; }
function Courses() { return <h2>Контент</h2>; }
function AcademyAdmin() { return <h2>Академия</h2>; }
function ServicesAdmin() { return <h2>Допуски к услугам</h2>; }
function Subscriptions() { return <h2>Подписки и промокоды</h2>; }
function Analytics() { return <h2>Аналитика</h2>; }
function Integrations() { return <h2>Интеграции</h2>; }
function Announcements() { return <h2>Рассылки</h2>; }

export default function Admin() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="staff/*" element={<Staff />} />
      <Route path="courses/*" element={<Courses />} />
      <Route path="academy/*" element={<AcademyAdmin />} />
      <Route path="services/*" element={<ServicesAdmin />} />
      <Route path="subscriptions/*" element={<Subscriptions />} />
      <Route path="analytics/*" element={<Analytics />} />
      <Route path="integrations/*" element={<Integrations />} />
      <Route path="announcements/*" element={<Announcements />} />
    </Routes>
  );
}
