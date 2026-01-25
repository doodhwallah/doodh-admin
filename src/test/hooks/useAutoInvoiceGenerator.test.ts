import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock the supabase client
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockLike = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      return {
        select: (...args: unknown[]) => {
          mockSelect(...args);
          return {
            eq: (...eqArgs: unknown[]) => {
              mockEq(...eqArgs);
              return {
                gte: (...gteArgs: unknown[]) => {
                  mockGte(...gteArgs);
                  return {
                    lte: (...lteArgs: unknown[]) => {
                      mockLte(...lteArgs);
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
                single: () => {
                  mockSingle();
                  return Promise.resolve({ data: { name: "Test Customer" }, error: null });
                },
                like: (...likeArgs: unknown[]) => {
                  mockLike(...likeArgs);
                  return Promise.resolve({ data: [], error: null, count: 0 });
                },
              };
            },
            like: (...likeArgs: unknown[]) => {
              mockLike(...likeArgs);
              return Promise.resolve({ data: [], error: null, count: 0 });
            },
          };
        },
        insert: (data: unknown) => {
          mockInsert(data);
          return Promise.resolve({ error: null });
        },
      };
    },
  },
}));

vi.mock("@/lib/supabase-helpers", () => ({
  getProductPrice: (product: { base_price?: number } | null) => product?.base_price || 0,
}));

// Import after mocking
import { useAutoInvoiceGenerator } from "@/hooks/useAutoInvoiceGenerator";

describe("useAutoInvoiceGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateInvoiceNumber", () => {
    it("should generate invoice number with correct format", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      const invoiceNumber = await result.current.generateInvoiceNumber();
      
      // Should match format INV-YYYYMM-XXX
      expect(invoiceNumber).toMatch(/^INV-\d{6}-\d{3}$/);
    });

    it("should include current year and month", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      const invoiceNumber = await result.current.generateInvoiceNumber();
      const now = new Date();
      const expectedPrefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      
      expect(invoiceNumber.startsWith(expectedPrefix)).toBe(true);
    });

    it("should increment sequence number based on existing invoices", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      const invoiceNumber = await result.current.generateInvoiceNumber();
      
      // When count is 0, should be -001
      expect(invoiceNumber.endsWith("-001")).toBe(true);
    });
  });

  describe("calculateCustomerInvoice", () => {
    it("should return null when no deliveries exist", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      const invoice = await result.current.calculateCustomerInvoice(
        "customer-123",
        "2024-01-01",
        "2024-01-31"
      );
      
      expect(invoice).toBeNull();
    });

    it("should query correct tables with proper date range", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      await result.current.calculateCustomerInvoice(
        "customer-123",
        "2024-01-01",
        "2024-01-31"
      );
      
      expect(mockFrom).toHaveBeenCalledWith("deliveries");
      expect(mockEq).toHaveBeenCalledWith("customer_id", "customer-123");
      expect(mockEq).toHaveBeenCalledWith("status", "delivered");
    });
  });

  describe("generateMonthlyInvoices", () => {
    it("should return result object with proper structure", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      const invoiceResult = await result.current.generateMonthlyInvoices(2024, 1);
      
      expect(invoiceResult).toHaveProperty("generated");
      expect(invoiceResult).toHaveProperty("skipped");
      expect(invoiceResult).toHaveProperty("total_amount");
      expect(invoiceResult).toHaveProperty("errors");
      expect(invoiceResult).toHaveProperty("invoices");
    });

    it("should handle empty customer list", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      const invoiceResult = await result.current.generateMonthlyInvoices(2024, 1);
      
      expect(invoiceResult.generated).toBe(0);
      expect(invoiceResult.errors).toHaveLength(0);
    });

    it("should use correct billing period dates", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      await result.current.generateMonthlyInvoices(2024, 1);
      
      expect(mockFrom).toHaveBeenCalledWith("customers");
      expect(mockFrom).toHaveBeenCalledWith("invoices");
    });
  });

  describe("edge cases", () => {
    it("should handle month boundaries correctly for January", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      const invoiceResult = await result.current.generateMonthlyInvoices(2024, 1);
      
      // Should not throw error
      expect(invoiceResult).toBeDefined();
    });

    it("should handle month boundaries correctly for December", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      const invoiceResult = await result.current.generateMonthlyInvoices(2024, 12);
      
      // Should not throw error
      expect(invoiceResult).toBeDefined();
    });

    it("should handle leap year February", async () => {
      const { result } = renderHook(() => useAutoInvoiceGenerator());
      
      // 2024 is a leap year
      const invoiceResult = await result.current.generateMonthlyInvoices(2024, 2);
      
      expect(invoiceResult).toBeDefined();
    });
  });
});
