export default function Loading() {
  return (
    <div className="space-y-4 p-6 animate-pulse">
      <div className="h-8 w-1/4 bg-slate-800 rounded" />
      <div className="h-4 w-1/3 bg-slate-800 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-24 bg-slate-800 rounded" />
        <div className="h-24 bg-slate-800 rounded" />
        <div className="h-24 bg-slate-800 rounded" />
      </div>
      <div className="h-64 bg-slate-800 rounded" />
    </div>
  );
}
