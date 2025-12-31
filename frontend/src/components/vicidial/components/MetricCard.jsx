export default function MetricCard({ title, value, color = 'blue', icon, trend }) {
  const isEmpty = value === null || value === undefined;
  // Color palette tuned to match the dashboard image (image 3)
  const colorStyles = {
    // deep blue card (Total Campaigns blue)
    blue: 'bg-gradient-to-br from-sky-700 to-blue-600 text-white',
    // bright green card
    green: 'bg-gradient-to-br from-emerald-500 to-green-600 text-white',
    // dark slate / indigo card
    dark: 'bg-gradient-to-br from-slate-800 to-slate-700 text-white',
    // fallback purple (used elsewhere)
    purple: 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white',
    // keep older aliases for compatibility
    pink: 'bg-gradient-to-br from-pink-500 to-rose-600 text-white',
    orange: 'bg-gradient-to-br from-orange-500 to-amber-600 text-white',
    gray: 'bg-gradient-to-br from-slate-600 to-gray-700 text-white',
    indigo: 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white',
    cyan: 'bg-gradient-to-br from-cyan-500 to-teal-600 text-white',
    teal: 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white'
  }[color] || 'bg-white text-gray-900 border border-gray-200';

  return (
    <div className={`rounded-lg shadow-md p-6 ${colorStyles} hover:shadow-xl hover:scale-105 transition-all duration-300 cursor-pointer relative overflow-hidden`}>
      {/* Background decoration */}
      <div className="absolute top-0 right-0 opacity-10 transform translate-x-4 -translate-y-4">
        {icon && <div className="w-32 h-32">{icon}</div>}
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium opacity-90">{title}</div>
          {icon && <div className="w-8 h-8 opacity-80">{icon}</div>}
        </div>
        <div className="text-4xl font-bold mb-1">
          {isEmpty ? <span className="inline-block w-16 h-10 bg-white/20 rounded animate-pulse" /> : value}
        </div>
        {trend && (
          <div className="text-xs opacity-75 mt-2">
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}
