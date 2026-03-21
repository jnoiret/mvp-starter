export default function AdminDashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 md:px-8 pb-14 pt-4">
      <div className="flex flex-col gap-8">
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-200/80" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-zinc-200/80"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-200/80" />
      </div>
    </div>
  );
}
