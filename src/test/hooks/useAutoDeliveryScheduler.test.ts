import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { format, addDays } from "date-fns";

// Mock data stores
let mockSubscriptions: Array<{ customer_id: string; product_id: string; quantity: number; is_active: boolean; customer: { id: string; is_active: boolean; route_id: string } }> = [];
let mockVacations: Array<{ customer_id: string }> = [];
let mockExistingDeliveries: Array<{ customer_id: string }> = [];

const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockFunctionsInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      return {
        select: () => ({
          eq: () => {
            if (table === "customer_products") {
              return Promise.resolve({ data: mockSubscriptions, error: null });
            }
            if (table === "deliveries") {
              return Promise.resolve({ data: mockExistingDeliveries, error: null });
            }
            return {
              lte: () => ({
                gte: () => Promise.resolve({ data: mockVacations, error: null }),
              }),
            };
          },
        }),
        insert: (data: unknown) => {
          mockInsert(data);
          return Promise.resolve({ error: null });
        },
      };
    },
    functions: {
      invoke: mockFunctionsInvoke,
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

// Import after mocking
import { useAutoDeliveryScheduler } from "@/hooks/useAutoDeliveryScheduler";

describe("useAutoDeliveryScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptions = [];
    mockVacations = [];
    mockExistingDeliveries = [];
  });

  describe("scheduleDeliveriesForDate", () => {
    it("should return zero scheduled when no subscriptions exist", async () => {
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const scheduleResult = await result.current.scheduleDeliveriesForDate("2024-01-15");
      
      expect(scheduleResult.scheduled).toBe(0);
      expect(scheduleResult.skipped).toBe(0);
      expect(scheduleResult.errors).toHaveLength(0);
    });

    it("should schedule deliveries for active subscriptions", async () => {
      mockSubscriptions = [
        {
          customer_id: "cust-1",
          product_id: "prod-1",
          quantity: 2,
          is_active: true,
          customer: { id: "cust-1", is_active: true, route_id: "route-1" },
        },
        {
          customer_id: "cust-2",
          product_id: "prod-1",
          quantity: 1,
          is_active: true,
          customer: { id: "cust-2", is_active: true, route_id: "route-1" },
        },
      ];
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const scheduleResult = await result.current.scheduleDeliveriesForDate("2024-01-15");
      
      expect(scheduleResult.scheduled).toBe(2);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("should skip customers on vacation", async () => {
      mockSubscriptions = [
        {
          customer_id: "cust-1",
          product_id: "prod-1",
          quantity: 2,
          is_active: true,
          customer: { id: "cust-1", is_active: true, route_id: "route-1" },
        },
      ];
      mockVacations = [{ customer_id: "cust-1" }];
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const scheduleResult = await result.current.scheduleDeliveriesForDate("2024-01-15");
      
      expect(scheduleResult.scheduled).toBe(0);
      expect(scheduleResult.skipped).toBe(1);
    });

    it("should skip customers with existing deliveries", async () => {
      mockSubscriptions = [
        {
          customer_id: "cust-1",
          product_id: "prod-1",
          quantity: 2,
          is_active: true,
          customer: { id: "cust-1", is_active: true, route_id: "route-1" },
        },
      ];
      mockExistingDeliveries = [{ customer_id: "cust-1" }];
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const scheduleResult = await result.current.scheduleDeliveriesForDate("2024-01-15");
      
      expect(scheduleResult.scheduled).toBe(0);
      expect(scheduleResult.skipped).toBe(1);
    });

    it("should handle customers with multiple subscriptions as single delivery", async () => {
      mockSubscriptions = [
        {
          customer_id: "cust-1",
          product_id: "prod-1",
          quantity: 2,
          is_active: true,
          customer: { id: "cust-1", is_active: true, route_id: "route-1" },
        },
        {
          customer_id: "cust-1",
          product_id: "prod-2",
          quantity: 1,
          is_active: true,
          customer: { id: "cust-1", is_active: true, route_id: "route-1" },
        },
      ];
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const scheduleResult = await result.current.scheduleDeliveriesForDate("2024-01-15");
      
      // Should create only 1 delivery, not 2
      expect(scheduleResult.scheduled).toBe(1);
    });

    it("should create deliveries with pending status", async () => {
      mockSubscriptions = [
        {
          customer_id: "cust-1",
          product_id: "prod-1",
          quantity: 2,
          is_active: true,
          customer: { id: "cust-1", is_active: true, route_id: "route-1" },
        },
      ];
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      await result.current.scheduleDeliveriesForDate("2024-01-15");
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            status: "pending",
            delivery_date: "2024-01-15",
          }),
        ])
      );
    });
  });

  describe("scheduleDeliveriesForRange", () => {
    it("should schedule for multiple days", async () => {
      mockSubscriptions = [
        {
          customer_id: "cust-1",
          product_id: "prod-1",
          quantity: 2,
          is_active: true,
          customer: { id: "cust-1", is_active: true, route_id: "route-1" },
        },
      ];
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const results = await result.current.scheduleDeliveriesForRange(new Date("2024-01-15"), 3);
      
      expect(results).toHaveLength(3);
    });

    it("should handle zero days", async () => {
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const results = await result.current.scheduleDeliveriesForRange(new Date("2024-01-15"), 0);
      
      expect(results).toHaveLength(0);
    });

    it("should use correct date format for each day", async () => {
      const startDate = new Date("2024-01-15");
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      await result.current.scheduleDeliveriesForRange(startDate, 2);
      
      // Should be called for both days
      expect(mockFrom).toHaveBeenCalledWith("deliveries");
    });
  });

  describe("triggerAutoMarkDelivered", () => {
    it("should invoke edge function", async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: { marked: 5 }, error: null });
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const response = await result.current.triggerAutoMarkDelivered();
      
      expect(mockFunctionsInvoke).toHaveBeenCalledWith("auto-mark-delivered", expect.any(Object));
      expect(response.success).toBe(true);
    });

    it("should pass date to edge function when provided", async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: { marked: 0 }, error: null });
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      await result.current.triggerAutoMarkDelivered("2024-01-15");
      
      expect(mockFunctionsInvoke).toHaveBeenCalledWith("auto-mark-delivered", {
        body: { date: "2024-01-15" },
      });
    });

    it("should handle edge function errors", async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: "Function failed" } });
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const response = await result.current.triggerAutoMarkDelivered();
      
      expect(response.success).toBe(false);
      expect(response.error).toBe("Function failed");
    });
  });

  describe("edge cases", () => {
    it("should handle date at month boundary", async () => {
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      // Last day of month
      const lastDay = await result.current.scheduleDeliveriesForDate("2024-01-31");
      expect(lastDay).toBeDefined();
      
      // First day of month
      const firstDay = await result.current.scheduleDeliveriesForDate("2024-02-01");
      expect(firstDay).toBeDefined();
    });

    it("should handle leap year date", async () => {
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const leapDay = await result.current.scheduleDeliveriesForDate("2024-02-29");
      expect(leapDay).toBeDefined();
    });

    it("should handle mixed vacation and existing delivery skips", async () => {
      mockSubscriptions = [
        {
          customer_id: "cust-1",
          product_id: "prod-1",
          quantity: 1,
          is_active: true,
          customer: { id: "cust-1", is_active: true, route_id: "route-1" },
        },
        {
          customer_id: "cust-2",
          product_id: "prod-1",
          quantity: 1,
          is_active: true,
          customer: { id: "cust-2", is_active: true, route_id: "route-1" },
        },
        {
          customer_id: "cust-3",
          product_id: "prod-1",
          quantity: 1,
          is_active: true,
          customer: { id: "cust-3", is_active: true, route_id: "route-1" },
        },
      ];
      mockVacations = [{ customer_id: "cust-1" }];
      mockExistingDeliveries = [{ customer_id: "cust-2" }];
      
      const { result } = renderHook(() => useAutoDeliveryScheduler());
      
      const scheduleResult = await result.current.scheduleDeliveriesForDate("2024-01-15");
      
      expect(scheduleResult.scheduled).toBe(1); // Only cust-3
      expect(scheduleResult.skipped).toBe(2); // cust-1 and cust-2
    });
  });
});
