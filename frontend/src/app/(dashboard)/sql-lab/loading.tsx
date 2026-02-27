import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="w-64 border-r p-3 space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-48" />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <Skeleton className="h-1/2 w-full" />
        <div className="border-t p-3 space-y-2 flex-1">
          <Skeleton className="h-6 w-24" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
