import { useState, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PullToRefresh } from "./PullToRefresh";

interface MobileDataViewProps<T> {
  data: T[];
  renderCard: (item: T, index: number) => ReactNode;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  className?: string;
  onRefresh?: () => Promise<void>;
  itemsPerPage?: number;
}

export function MobileDataView<T extends { id: string }>({
  data,
  renderCard,
  loading = false,
  searchable = true,
  searchPlaceholder = "Search...",
  emptyMessage = "No data found",
  emptyIcon,
  className,
  onRefresh,
  itemsPerPage = 10,
}: MobileDataViewProps<T>) {
  const [search, setSearch] = useState("");
  const [visibleItems, setVisibleItems] = useState(itemsPerPage);

  const filteredData = searchable
    ? data.filter((item) =>
        Object.values(item).some(
          (value) =>
            value &&
            value.toString().toLowerCase().includes(search.toLowerCase())
        )
      )
    : data;

  const displayedData = filteredData.slice(0, visibleItems);
  const hasMore = visibleItems < filteredData.length;

  const handleLoadMore = () => {
    setVisibleItems((prev) => prev + itemsPerPage);
  };

  const content = (
    <div className={cn("space-y-4", className)}>
      {searchable && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2 -mx-1 px-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleItems(itemsPerPage);
              }}
              className="pl-10 h-12 text-base rounded-xl"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
          </div>
          <span className="text-muted-foreground font-medium">Loading...</span>
        </div>
      ) : displayedData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
            {emptyIcon || <Search className="h-7 w-7 text-muted-foreground" />}
          </div>
          <span className="text-muted-foreground font-medium text-center">
            {emptyMessage}
          </span>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {displayedData.map((item, index) => (
              <div 
                key={item.id}
                className="animate-slide-up"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                {renderCard(item, index)}
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2 pb-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                className="gap-2"
              >
                <ChevronDown className="h-4 w-4" />
                Load More ({filteredData.length - visibleItems} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (onRefresh) {
    return (
      <PullToRefresh onRefresh={onRefresh} disabled={loading}>
        {content}
      </PullToRefresh>
    );
  }

  return content;
}
