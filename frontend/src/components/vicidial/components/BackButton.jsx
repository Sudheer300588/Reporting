import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ to, onClick }) {
  const nav = useNavigate();
  const handle = () => {
    if (onClick) return onClick();
    if (to) return nav(to);
    return nav(-1);
  };
  return (
    <button onClick={handle} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
      <ArrowLeft size={16} />
      <span className="font-medium">Back</span>
    </button>
  );
}
