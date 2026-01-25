import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock data
let mockExistingExpenses: Array<{ id: string }> = [];

const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockLike = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      return {
        select: () => {
          mockSelect();
          return {
            like: (field: string, pattern: string) => {
              mockLike(field, pattern);
              return {
                limit: () => Promise.resolve({ data: mockExistingExpenses, error: null }),
              };
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

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    expense: vi.fn(),
  },
}));

// Import after mocking
import { useExpenseAutomation } from "@/hooks/useExpenseAutomation";

describe("useExpenseAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingExpenses = [];
  });

  describe("createExpense", () => {
    it("should create expense successfully", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      const success = await result.current.createExpense({
        category: "feed",
        title: "Test Expense",
        amount: 500,
        expense_date: "2024-01-15",
      });
      
      expect(success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "feed",
          title: "Test Expense",
          amount: 500,
        })
      );
    });

    it("should skip duplicate expenses with same reference", async () => {
      mockExistingExpenses = [{ id: "existing-expense" }];
      
      const { result } = renderHook(() => useExpenseAutomation());
      
      const success = await result.current.createExpense({
        category: "salary",
        title: "Salary",
        amount: 10000,
        expense_date: "2024-01-15",
        reference_type: "payroll",
        reference_id: "payroll-123",
      });
      
      expect(success).toBe(false);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should include AUTO tag in notes when reference provided", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.createExpense({
        category: "feed",
        title: "Feed Purchase",
        amount: 2000,
        expense_date: "2024-01-15",
        reference_type: "feed_purchase",
        reference_id: "feed-456",
        notes: "Extra info",
      });
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: expect.stringContaining("[AUTO] feed_purchase:feed-456"),
        })
      );
    });
  });

  describe("logSalaryExpense", () => {
    it("should create salary expense with correct format", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      const success = await result.current.logSalaryExpense(
        "John Doe",
        25000,
        "2024-01-01",
        "2024-01-31",
        "payroll-001"
      );
      
      expect(success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "salary",
          title: "Salary - John Doe",
          amount: 25000,
        })
      );
    });

    it("should not create expense for zero or negative salary", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      const success = await result.current.logSalaryExpense(
        "John Doe",
        0,
        "2024-01-01",
        "2024-01-31",
        "payroll-001"
      );
      
      expect(success).toBe(false);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should include pay period in notes", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logSalaryExpense(
        "John Doe",
        25000,
        "2024-01-01",
        "2024-01-31",
        "payroll-001"
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: expect.stringContaining("Pay period"),
        })
      );
    });
  });

  describe("logEquipmentPurchase", () => {
    it("should create equipment expense", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      const success = await result.current.logEquipmentPurchase(
        "Milking Machine",
        150000,
        "2024-01-10",
        "equip-001"
      );
      
      expect(success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "misc",
          title: "Equipment Purchase - Milking Machine",
          amount: 150000,
        })
      );
    });

    it("should skip zero cost equipment", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      const success = await result.current.logEquipmentPurchase(
        "Free Sample",
        0,
        "2024-01-10",
        "equip-002"
      );
      
      expect(success).toBe(false);
    });
  });

  describe("logMaintenanceExpense", () => {
    it("should capitalize maintenance type", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logMaintenanceExpense(
        "Tractor",
        "preventive",
        5000,
        "2024-01-15",
        "maint-001"
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Preventive - Tractor",
        })
      );
    });
  });

  describe("logHealthExpense", () => {
    it("should include cattle tag and record type in title", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logHealthExpense(
        "C001",
        "vaccination",
        "FMD Vaccine",
        250,
        "2024-01-15",
        "health-001"
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "medicine",
          title: "Vaccination - C001: FMD Vaccine",
          amount: 250,
        })
      );
    });
  });

  describe("logFeedPurchase", () => {
    it("should calculate total from quantity and unit cost", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logFeedPurchase(
        "Green Fodder",
        100,
        50,
        "kg"
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "feed",
          amount: 5000, // 100 * 50
        })
      );
    });

    it("should include quantity details in notes", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logFeedPurchase(
        "Wheat Bran",
        50,
        30,
        "kg"
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: expect.stringContaining("50 kg @ ₹30/kg"),
        })
      );
    });

    it("should generate unique reference for each purchase", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logFeedPurchase("Feed A", 10, 100, "kg");
      
      expect(mockLike).toHaveBeenCalledWith(
        "notes",
        expect.stringContaining("feed_purchase:feed_Feed_A_")
      );
    });
  });

  describe("logMilkProcurementPayment", () => {
    it("should create milk procurement expense", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logMilkProcurementPayment(
        "Local Farmer",
        15000,
        "2024-01-15",
        "proc-001",
        500
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Milk Procurement - Local Farmer",
          amount: 15000,
        })
      );
    });

    it("should include quantity in notes when provided", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logMilkProcurementPayment(
        "Vendor",
        10000,
        "2024-01-15",
        "proc-002",
        300
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: expect.stringContaining("300L"),
        })
      );
    });
  });

  describe("logBottleLoss", () => {
    it("should calculate total loss from quantity and deposit", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logBottleLoss("Glass 1L", 5, 50, "Broken in transit");
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "misc",
          title: "Bottle Loss - Glass 1L",
          amount: 250, // 5 * 50
        })
      );
    });
  });

  describe("edge cases", () => {
    it("should handle very large amounts", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      const success = await result.current.logGenericExpense(
        "machinery",
        "Heavy Equipment",
        9999999.99
      );
      
      expect(success).toBe(true);
    });

    it("should reject negative amounts", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      const success = await result.current.logGenericExpense(
        "misc",
        "Negative Expense",
        -100
      );
      
      expect(success).toBe(false);
    });

    it("should use current date when not provided", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logTransportExpense("Fuel", 500);
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          expense_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        })
      );
    });

    it("should sanitize item names in references", async () => {
      const { result } = renderHook(() => useExpenseAutomation());
      
      await result.current.logFeedPurchase("Green Fodder Special", 10, 100, "kg");
      
      expect(mockLike).toHaveBeenCalledWith(
        "notes",
        expect.stringContaining("feed_Green_Fodder_Special")
      );
    });
  });
});
