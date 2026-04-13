import { Link } from 'react-router-dom';

export default function CourseCard({ course }) {
  return (
    <Link
      to={`/course/${course.id}`}
      className="flex-shrink-0 w-64 rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
    >
      <div className="aspect-video bg-gray-200 relative overflow-hidden">
        {course.cover ? (
          <img
            src={course.cover}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
            <svg className="w-12 h-12 text-accent/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
            </svg>
          </div>
        )}
        {course.tag && (
          <span className="absolute top-2 left-2 bg-accent text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
            {course.tag}
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 leading-tight">
          {course.title}
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          {course.lessons} уроков · {course.duration}
        </p>
      </div>
    </Link>
  );
}
