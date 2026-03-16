type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-10 text-center shadow-sm">
      <h2 className="text-base font-medium text-[#0F172A]">
        {title}
      </h2>
      {description ? (
        <p className="max-w-md text-sm text-[#475569]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

