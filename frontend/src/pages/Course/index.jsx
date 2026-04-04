/**
 * Online learning section.
 *
 * Sub-routes:
 *   /course                     — list of available courses
 *   /course/:courseId           — course detail / module list
 *   /course/:courseId/:lessonId — lesson page (text + video + test + assignment)
 */
import { Routes, Route } from "react-router-dom";

function CourseList() {
  return <h2>Мои курсы</h2>;
}

function CourseDetail() {
  return <h2>Курс</h2>;
}

function LessonPage() {
  return <h2>Урок</h2>;
}

export default function Course() {
  return (
    <Routes>
      <Route index element={<CourseList />} />
      <Route path=":courseId" element={<CourseDetail />} />
      <Route path=":courseId/:lessonId" element={<LessonPage />} />
    </Routes>
  );
}
