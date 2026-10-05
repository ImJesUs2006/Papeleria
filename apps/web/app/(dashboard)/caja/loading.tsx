export default function Loading() {
  return (
    <div className="space-y-4 p-6 animate-pulse">
      <div className="h-8 w-1/4 bg-slate-800 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="h-20 bg-slate-800 rounded" />
        <div className="h-20 bg-slate-800 rounded" />
        <div className="h-20 bg-slate-800 rounded" />
        <div className="h-20 bg-slate-800 rounded" />
      </div>
      <div className="h-64 bg-slate-800 rounded" />
    </div>
  );
}
