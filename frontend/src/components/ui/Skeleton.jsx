/**
 * Skeleton shimmer — used while data is loading.
 * className controls size/shape.
 */
export function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:400%_100%] rounded-lg ${className}`}
      style={{ animation: "shimmer 1.6s infinite linear" }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow p-5 space-y-3">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-3 rounded-full" />
      </div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-20" />
      <div className="flex justify-between pt-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow p-4">
      <Skeleton className="h-4 w-28 mb-4" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}