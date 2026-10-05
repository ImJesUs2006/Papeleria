export default function Loading() {
  return (
    <div className="space-y-4 p-6 animate-pulse">
      <div className="h-8 w-1/4 bg-slate-800 rounded" />
      <div className="flex gap-3">
        <div className="h-10 w-3/4 bg-slate-800 rounded" />
        <div className="h-10 w-40 bg-slate-800 rounded" />
      </div>
      <div className="h-96 bg-slate-800 rounded" />
    </div>
  );
}
