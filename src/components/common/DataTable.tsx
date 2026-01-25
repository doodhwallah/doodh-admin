import { ReactNode, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  className?: string;
  itemsPerPage?: number;
  renderMobileCard?: (item: T, index: number) => ReactNode;
  onRefresh?: () => Promise<void>;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  loading = false,
  searchable = true,
  searchPlaceholder = "Search...",
  onRowClick,
  emptyMessage = "No data found",
  emptyIcon,
  className,
  itemsPerPage = 10,
  renderMobileCard,
  onRefresh,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileVisibleItems, setMobileVisibleItems] = useState(itemsPerPage);
  const isMobile = useIsMobile();

  const filteredData = searchable
    ? data.filter((item) =>
        Object.values(item).some(
          (value) =>
            value &&
            value.toString().toLowerCase().includes(search.toLowerCase())
        )
      )
    : data;

  // Desktop pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Mobile infinite scroll
  const mobileDisplayedData = filteredData.slice(0, mobileVisibleItems);
  const hasMoreMobile = mobileVisibleItems < filteredData.length;

  // Filter columns for mobile (hide columns marked with hideOnMobile)
  const visibleColumns = isMobile 
    ? columns.filter(col => !col.hideOnMobile)
    : columns;

  const handleLoadMore = () => {
    setMobileVisibleItems((prev) => prev + itemsPerPage);
  };

  // Mobile card view
  if (isMobile && renderMobileCard) {
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
                  setMobileVisibleItems(itemsPerPage);
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
        ) : mobileDisplayedData.length === 0 ? (
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
              {mobileDisplayedData.map((item, index) => (
                <div 
                  key={item.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
                  onClick={() => onRowClick?.(item)}
                >
                  {renderMobileCard(item, index)}
                </div>
              ))}
            </div>

            {hasMoreMobile && (
              <div className="flex justify-center pt-2 pb-4">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  className="gap-2"
                >
                  <ChevronDown className="h-4 w-4" />
                  Load More ({filteredData.length - mobileVisibleItems} remaining)
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

  // Desktop table view
  return (
    <div className={cn("space-y-4", className)}>
      {searchable && (
        <div className="relative max-w-sm animate-slide-up">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-11"
          />
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-soft overflow-hidden animate-fade-in" style={{ animationDelay: '100ms' }}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b-2">
                {visibleColumns.map((column) => (
                  <TableHead key={column.key} className={cn("font-semibold", column.className)}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="stagger-animation">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="relative h-10 w-10">
                        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                        <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
                      </div>
                      <span className="text-muted-foreground font-medium">Loading data...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                        {emptyIcon || <Search className="h-6 w-6 text-muted-foreground" />}
                      </div>
                      <span className="text-muted-foreground font-medium">{emptyMessage}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((item, index) => (
                  <TableRow
                    key={item.id}
                    onClick={() => onRowClick?.(item)}
                    className={cn(
                      "animate-slide-up group",
                      onRowClick && "cursor-pointer"
                    )}
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    {visibleColumns.map((column) => (
                      <TableCell key={column.key} className={cn("transition-colors", column.className)}>
                        {column.render
                          ? column.render(item)
                          : (item as Record<string, unknown>)[column.key]?.toString() || "-"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between animate-fade-in" style={{ animationDelay: '200ms' }}>
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
            <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of{" "}
            <span className="font-medium text-foreground">{filteredData.length}</span> entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "ghost"}
                    size="sm"
                    className={cn("w-9 h-9 p-0", currentPage === pageNum && "shadow-sm")}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="gap-1"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
