
export default function LoadingSkeleton({ rows = 8, columns = 3 }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((__, c) => (
            <div key={c} className="flex-1 h-6 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
