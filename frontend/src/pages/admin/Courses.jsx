import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses, createCourse } from '../../api/courses';
import { getPresignedUrl, uploadToS3 } from '../../api/upload';

const ROLE_OPTIONS = [
  { value: 'novice', label: 'Новичок' },
  { value: 'master', label: 'Мастер' },
  { value: 'senior_master', label: 'Старший мастер' },
  { value: 'teacher', label: 'Преподаватель' },
  { value: 'manager', label: 'Менеджер' },
];

const FILTERS = [
  { value: null, label: 'Все' },
  { value: 'published', label: 'Опубликованные' },
  { value: 'draft', label: 'Черновики' },
];

export default function Courses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'published') params.is_published = true;
      if (filter === 'draft') params.is_published = false;
      const data = await getCourses(params);
      setCourses(data);
    } catch { /* interceptor */ }
    setLoading(false);
  };

  useEffect(() => { fetchCourses(); }, [filter]);

  return (
    <div className="bg-surface min-h-screen pb-8">
      <header className="bg-white px-4 pt-4 pb-3 shadow-sm sticky top-0 z-30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="text-gray-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-extrabold text-gray-900">Курсы</h1>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center shadow-sm shadow-accent/20 active:scale-95"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              onClick={() => setFilter(f.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f.value ? 'bg-accent text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 mt-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : courses.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Курсов пока нет</p>
        ) : (
          courses.map((course) => (
            <button
              key={course.id}
              onClick={() => navigate(`/admin/courses/${course.id}`)}
              className="w-full bg-white rounded-2xl shadow-sm border border-gray-50 overflow-hidden text-left active:scale-[0.99] transition-transform"
            >
              <div className="aspect-video bg-gradient-to-br from-accent/20 to-orange-50 relative">
                {course.cover_url ? (
                  <img src={course.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-accent/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                    </svg>
                  </div>
                )}
                <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  course.is_published ? 'bg-green-500 text-white' : 'bg-gray-700/70 text-white'
                }`}>
                  {course.is_published ? 'Опубликован' : 'Черновик'}
                </span>
              </div>
              <div className="p-3">
                <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">{course.title}</h3>
                {course.target_roles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {course.target_roles.map((r) => (
                      <span key={r} className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-medium">
                        {ROLE_OPTIONS.find((o) => o.value === r)?.label || r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {showAdd && (
        <AddCourseSheet
          onClose={() => setShowAdd(false)}
          onCreated={(id) => { setShowAdd(false); navigate(`/admin/courses/${id}`); }}
        />
      )}
    </div>
  );
}

function AddCourseSheet({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetRoles, setTargetRoles] = useState([]);
  const [coverUrl, setCoverUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleRole = (role) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const { upload_url, file_url } = await getPresignedUrl(file.name, file.type, 'images');
      await uploadToS3(upload_url, file, setUploadProgress);
      setCoverUrl(file_url);
    } catch {
      setError('Ошибка загрузки обложки');
    }
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      const course = await createCourse({
        title: title.trim(),
        description: description.trim() || null,
        target_roles: targetRoles,
        cover_url: coverUrl || null,
      });
      onCreated(course.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка создания');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h3 className="font-bold text-lg text-gray-900 mb-4">Новый курс</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название курса"
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (необязательно)"
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-surface text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Целевые роли</p>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => toggleRole(r.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    targetRoles.includes(r.value)
                      ? 'bg-accent text-white'
                      : 'bg-surface text-gray-600 border border-gray-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Обложка</p>
            {coverUrl ? (
              <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-100">
                <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setCoverUrl('')} className="absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center text-xs">✕</button>
              </div>
            ) : (
              <label className={`flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-accent/40 transition-colors ${uploading ? 'opacity-60' : ''}`}>
                <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploading} />
                {uploading ? (
                  <span className="text-sm text-gray-400">Загрузка {uploadProgress}%</span>
                ) : (
                  <span className="text-sm text-gray-400">Выбрать изображение</span>
                )}
              </label>
            )}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {loading ? 'Создание...' : 'Создать курс'}
          </button>
        </form>
      </div>
    </div>
  );
}
