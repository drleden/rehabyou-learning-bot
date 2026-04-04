/**
 * Academy section — for novices and veteran masters.
 *
 * Sub-routes:
 *   /academy              — schedule list
 *   /academy/:scheduleId  — session detail + materials + attendance
 *   /academy/journal      — novice journal (own)
 *   /academy/attestation  — attestation request / status
 */
import { Routes, Route } from "react-router-dom";

function Schedule() {
  return <h2>Расписание академии</h2>;
}

function SessionDetail() {
  return <h2>Занятие</h2>;
}

function NoviceJournal() {
  return <h2>Журнал новичка</h2>;
}

function Attestation() {
  return <h2>Аттестация</h2>;
}

export default function Academy() {
  return (
    <Routes>
      <Route index element={<Schedule />} />
      <Route path=":scheduleId" element={<SessionDetail />} />
      <Route path="journal" element={<NoviceJournal />} />
      <Route path="attestation" element={<Attestation />} />
    </Routes>
  );
}
