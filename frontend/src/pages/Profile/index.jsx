/**
 * Profile section.
 *
 * Sub-routes:
 *   /profile          — own profile + service permissions + badges
 *   /profile/psych    — psychological test entry point (onboarding)
 *   /profile/:userId  — another user's profile (manager/owner only)
 */
import { Routes, Route } from "react-router-dom";

function OwnProfile() {
  return <h2>Мой профиль</h2>;
}

function PsychTest() {
  return <h2>Психологический тест</h2>;
}

function UserProfile() {
  return <h2>Профиль сотрудника</h2>;
}

export default function Profile() {
  return (
    <Routes>
      <Route index element={<OwnProfile />} />
      <Route path="psych" element={<PsychTest />} />
      <Route path=":userId" element={<UserProfile />} />
    </Routes>
  );
}
