import { AlertTriangle, RefreshCw } from "lucide-react";

export function ErrorBanner({ message, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-sm text-red-700">
      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium">Connection error</p>
        <p className="text-red-500 mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg transition"
        >
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}