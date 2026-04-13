export default function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between px-4 mb-3">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {action && (
        <button className="text-sm font-medium text-accent hover:text-accent-hover transition-colors">
          {action}
        </button>
      )}
    </div>
  );
}
