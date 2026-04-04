import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Course from "./pages/Course";
import Academy from "./pages/Academy";
import Profile from "./pages/Profile";
import AIAssistant from "./pages/AIAssistant";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/course/*" element={<Course />} />
      <Route path="/academy/*" element={<Academy />} />
      <Route path="/profile/*" element={<Profile />} />
      <Route path="/ai" element={<AIAssistant />} />
      <Route path="/admin/*" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
