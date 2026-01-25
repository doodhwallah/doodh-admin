import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock data
let mockLedgerData: Array<{ running_balance?: number; debit_amount?: number; credit_amount?: number; reference_id?: string }> = [];
let mockInvoiceData: Array<{ id: string; invoice_number: string; final_amount: number; created_at: string }> = [];

const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve({ 
                    data: mockLedgerData[0] || null, 
                    error: null 
                  }),
                }),
              }),
            }),
            then: (resolve: (value: { data: unknown; error: null }) => void) => {
              if (table === "customer_ledger") {
                return resolve({ data: mockLedgerData, error: null });
              }
              if (table === "invoices") {
                return resolve({ data: mockInvoiceData, error: null });
              }
              return resolve({ data: [], error: null });
            },
          }),
        }),
        insert: (data: unknown) => {
          mockInsert(data);
          return Promise.resolve({ error: null });
        },
        update: (data: unknown) => {
          mockUpdate(data);
          return {
            eq: () => Promise.resolve({ error: null }),
          };
        },
      };
    },
  },
}));

// Import after mocking
import { useLedgerAutomation } from "@/hooks/useLedgerAutomation";

describe("useLedgerAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLedgerData = [];
    mockInvoiceData = [];
  });

  describe("getRunningBalance", () => {
    it("should return 0 when no ledger entries exist", async () => {
      mockLedgerData = [];
      const { result } = renderHook(() => useLedgerAutomation());
      
      const balance = await result.current.getRunningBalance("customer-123");
      
      expect(balance).toBe(0);
    });

    it("should return the most recent running balance", async () => {
      mockLedgerData = [{ running_balance: 1500 }];
      const { result } = renderHook(() => useLedgerAutomation());
      
      const balance = await result.current.getRunningBalance("customer-123");
      
      expect(balance).toBe(1500);
    });
  });

  describe("createLedgerEntry", () => {
    it("should create entry with calculated running balance", async () => {
      mockLedgerData = [{ running_balance: 1000 }];
      const { result } = renderHook(() => useLedgerAutomation());
      
      const success = await result.current.createLedgerEntry({
        customer_id: "customer-123",
        transaction_type: "delivery",
        description: "Test delivery",
        debit_amount: 500,
      });
      
      expect(success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: "customer-123",
          debit_amount: 500,
          running_balance: 1500, // 1000 + 500
        })
      );
    });

    it("should calculate balance correctly for credits", async () => {
      mockLedgerData = [{ running_balance: 1000 }];
      const { result } = renderHook(() => useLedgerAutomation());
      
      await result.current.createLedgerEntry({
        customer_id: "customer-123",
        transaction_type: "payment",
        description: "Payment received",
        credit_amount: 300,
      });
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          running_balance: 700, // 1000 - 300
        })
      );
    });

    it("should handle null amounts as zero", async () => {
      mockLedgerData = [];
      const { result } = renderHook(() => useLedgerAutomation());
      
      await result.current.createLedgerEntry({
        customer_id: "customer-123",
        transaction_type: "note",
        description: "Just a note",
      });
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          running_balance: 0,
        })
      );
    });
  });

  describe("logDeliveryCharge", () => {
    it("should create debit entry for delivery", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      const success = await result.current.logDeliveryCharge(
        "customer-123",
        "delivery-456",
        250,
        "2024-01-15"
      );
      
      expect(success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_type: "delivery",
          debit_amount: 250,
          reference_id: "delivery-456",
        })
      );
    });

    it("should include formatted date in description", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      await result.current.logDeliveryCharge(
        "customer-123",
        "delivery-456",
        250,
        "2024-01-15"
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining("15"),
        })
      );
    });
  });

  describe("logPayment", () => {
    it("should create credit entry for payment", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      const success = await result.current.logPayment(
        "customer-123",
        "payment-789",
        1000,
        "UPI"
      );
      
      expect(success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_type: "payment",
          credit_amount: 1000,
          reference_id: "payment-789",
        })
      );
    });

    it("should include payment mode in description", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      await result.current.logPayment(
        "customer-123",
        "payment-789",
        1000,
        "Cash"
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining("Cash"),
        })
      );
    });
  });

  describe("logInvoice", () => {
    it("should create debit entry for invoice", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      const success = await result.current.logInvoice(
        "customer-123",
        "invoice-101",
        "INV-202401-001",
        5000
      );
      
      expect(success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_type: "invoice",
          debit_amount: 5000,
          reference_id: "invoice-101",
        })
      );
    });

    it("should include invoice number in description", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      await result.current.logInvoice(
        "customer-123",
        "invoice-101",
        "INV-202401-001",
        5000
      );
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining("INV-202401-001"),
        })
      );
    });
  });

  describe("logAdvancePayment", () => {
    it("should create credit entry for advance", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      const success = await result.current.logAdvancePayment(
        "customer-123",
        2000,
        "Advance for next month"
      );
      
      expect(success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_type: "advance",
          credit_amount: 2000,
        })
      );
    });

    it("should use default description when notes not provided", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      await result.current.logAdvancePayment("customer-123", 2000);
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Advance payment received",
        })
      );
    });
  });

  describe("calculateBalance", () => {
    it("should sum all debits and credits correctly", async () => {
      mockLedgerData = [
        { debit_amount: 500, credit_amount: null },
        { debit_amount: 300, credit_amount: null },
        { debit_amount: null, credit_amount: 200 },
      ];
      
      const { result } = renderHook(() => useLedgerAutomation());
      
      const balance = await result.current.calculateBalance("customer-123");
      
      expect(balance.total_debit).toBe(800);
      expect(balance.total_credit).toBe(200);
      expect(balance.balance).toBe(600);
    });

    it("should return zeros for empty ledger", async () => {
      mockLedgerData = [];
      const { result } = renderHook(() => useLedgerAutomation());
      
      const balance = await result.current.calculateBalance("customer-123");
      
      expect(balance.total_debit).toBe(0);
      expect(balance.total_credit).toBe(0);
      expect(balance.balance).toBe(0);
    });
  });

  describe("syncInvoicesToLedger", () => {
    it("should skip already synced invoices", async () => {
      mockInvoiceData = [
        { id: "inv-1", invoice_number: "INV-001", final_amount: 1000, created_at: "2024-01-01" },
      ];
      mockLedgerData = [{ reference_id: "inv-1" }];
      
      const { result } = renderHook(() => useLedgerAutomation());
      
      const syncResult = await result.current.syncInvoicesToLedger("customer-123");
      
      expect(syncResult.created).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle negative balances", async () => {
      mockLedgerData = [{ running_balance: -500 }];
      const { result } = renderHook(() => useLedgerAutomation());
      
      await result.current.createLedgerEntry({
        customer_id: "customer-123",
        transaction_type: "payment",
        description: "Extra payment",
        credit_amount: 200,
      });
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          running_balance: -700, // -500 - 200
        })
      );
    });

    it("should handle very large amounts", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      const success = await result.current.logInvoice(
        "customer-123",
        "invoice-big",
        "INV-BIG",
        9999999.99
      );
      
      expect(success).toBe(true);
    });

    it("should handle zero amount entries", async () => {
      const { result } = renderHook(() => useLedgerAutomation());
      
      const success = await result.current.logDeliveryCharge(
        "customer-123",
        "delivery-free",
        0,
        "2024-01-15"
      );
      
      expect(success).toBe(true);
    });
  });
});
