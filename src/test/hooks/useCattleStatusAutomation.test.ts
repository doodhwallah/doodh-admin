import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { format, subDays, addDays } from "date-fns";

// Mock data stores
let mockCattle: Array<{ id: string; tag_number: string; lactation_status: string | null; status: string }> = [];
let mockBreedingRecords: Array<{
  cattle_id: string;
  record_type: string;
  record_date: string;
  actual_calving_date?: string;
  pregnancy_confirmed?: boolean;
  expected_calving_date?: string;
}> = [];
let mockProduction: Array<{ cattle_id: string; production_date: string }> = [];

const mockFrom = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      return {
        select: () => ({
          eq: (field: string, value: string) => {
            if (table === "cattle") {
              return {
                eq: () => Promise.resolve({ data: mockCattle, error: null }),
              };
            }
            return Promise.resolve({ data: [], error: null });
          },
          order: () => Promise.resolve({ data: mockBreedingRecords, error: null }),
          gte: () => Promise.resolve({ data: mockProduction, error: null }),
        }),
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
import { useCattleStatusAutomation } from "@/hooks/useCattleStatusAutomation";

describe("useCattleStatusAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCattle = [];
    mockBreedingRecords = [];
    mockProduction = [];
  });

  describe("runAutomation", () => {
    it("should return empty result when no cattle exist", async () => {
      const { result } = renderHook(() => useCattleStatusAutomation());
      
      const automationResult = await result.current.runAutomation();
      
      expect(automationResult.updated).toBe(0);
      expect(automationResult.updates).toHaveLength(0);
      expect(automationResult.errors).toHaveLength(0);
    });

    it("should have correct result structure", async () => {
      const { result } = renderHook(() => useCattleStatusAutomation());
      
      const automationResult = await result.current.runAutomation();
      
      expect(automationResult).toHaveProperty("updated");
      expect(automationResult).toHaveProperty("updates");
      expect(automationResult).toHaveProperty("errors");
    });

    describe("Rule 1: Dry-off before calving", () => {
      it("should set lactation_status to dry when 60 days before calving", async () => {
        const expectedCalving = format(addDays(new Date(), 45), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "lactating", status: "active" },
        ];
        mockBreedingRecords = [
          {
            cattle_id: "cow-1",
            record_type: "pregnancy_check",
            record_date: "2024-01-01",
            pregnancy_confirmed: true,
            expected_calving_date: expectedCalving,
          },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updated).toBe(1);
        expect(mockUpdate).toHaveBeenCalledWith({ lactation_status: "dry" });
      });

      it("should not dry off if more than 60 days before calving", async () => {
        const expectedCalving = format(addDays(new Date(), 90), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "lactating", status: "active" },
        ];
        mockBreedingRecords = [
          {
            cattle_id: "cow-1",
            record_type: "pregnancy_check",
            record_date: "2024-01-01",
            pregnancy_confirmed: true,
            expected_calving_date: expectedCalving,
          },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updated).toBe(0);
      });
    });

    describe("Rule 2: Lactating after calving", () => {
      it("should set lactation_status to lactating within 7 days of calving", async () => {
        const recentCalving = format(subDays(new Date(), 3), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "dry", status: "active" },
        ];
        mockBreedingRecords = [
          {
            cattle_id: "cow-1",
            record_type: "calving",
            record_date: recentCalving,
            actual_calving_date: recentCalving,
          },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updated).toBe(1);
        expect(mockUpdate).toHaveBeenCalledWith({ lactation_status: "lactating" });
      });

      it("should not change if already lactating", async () => {
        const recentCalving = format(subDays(new Date(), 3), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "lactating", status: "active" },
        ];
        mockBreedingRecords = [
          {
            cattle_id: "cow-1",
            record_type: "calving",
            record_date: recentCalving,
            actual_calving_date: recentCalving,
          },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updated).toBe(0);
      });
    });

    describe("Rule 3: Pregnancy confirmation", () => {
      it("should set pregnant status when confirmed and no lactation status", async () => {
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: null, status: "active" },
        ];
        mockBreedingRecords = [
          {
            cattle_id: "cow-1",
            record_type: "pregnancy_check",
            record_date: "2024-01-01",
            pregnancy_confirmed: true,
            expected_calving_date: format(addDays(new Date(), 200), "yyyy-MM-dd"),
          },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updated).toBe(1);
        expect(mockUpdate).toHaveBeenCalledWith({ lactation_status: "pregnant" });
      });
    });

    describe("Rule 4: Dry from no production", () => {
      it("should set dry when no production for 30+ days", async () => {
        const oldProduction = format(subDays(new Date(), 35), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "lactating", status: "active" },
        ];
        mockProduction = [
          { cattle_id: "cow-1", production_date: oldProduction },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updated).toBe(1);
        expect(mockUpdate).toHaveBeenCalledWith({ lactation_status: "dry" });
      });

      it("should not change if production within 30 days", async () => {
        const recentProduction = format(subDays(new Date(), 10), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "lactating", status: "active" },
        ];
        mockProduction = [
          { cattle_id: "cow-1", production_date: recentProduction },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updated).toBe(0);
      });

      it("should set dry when no production records at all", async () => {
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "lactating", status: "active" },
        ];
        mockProduction = [];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updated).toBe(1);
        expect(mockUpdate).toHaveBeenCalledWith({ lactation_status: "dry" });
      });
    });

    describe("edge cases", () => {
      it("should handle multiple cattle with different statuses", async () => {
        const recentCalving = format(subDays(new Date(), 3), "yyyy-MM-dd");
        const recentProduction = format(subDays(new Date(), 5), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "dry", status: "active" },
          { id: "cow-2", tag_number: "C002", lactation_status: "lactating", status: "active" },
        ];
        mockBreedingRecords = [
          {
            cattle_id: "cow-1",
            record_type: "calving",
            record_date: recentCalving,
            actual_calving_date: recentCalving,
          },
        ];
        mockProduction = [
          { cattle_id: "cow-2", production_date: recentProduction },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        // Only cow-1 should be updated (to lactating after calving)
        expect(automationResult.updated).toBe(1);
      });

      it("should track update reasons in result", async () => {
        const recentCalving = format(subDays(new Date(), 3), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "dry", status: "active" },
        ];
        mockBreedingRecords = [
          {
            cattle_id: "cow-1",
            record_type: "calving",
            record_date: recentCalving,
            actual_calving_date: recentCalving,
          },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        expect(automationResult.updates[0]).toHaveProperty("cattle_id", "cow-1");
        expect(automationResult.updates[0]).toHaveProperty("tag_number", "C001");
        expect(automationResult.updates[0]).toHaveProperty("update_type", "lactation_status");
        expect(automationResult.updates[0]).toHaveProperty("old_value", "dry");
        expect(automationResult.updates[0]).toHaveProperty("new_value", "lactating");
        expect(automationResult.updates[0]).toHaveProperty("reason");
      });

      it("should prioritize dry-off rule over other rules", async () => {
        // A cow that is lactating but within 60 days of calving
        const expectedCalving = format(addDays(new Date(), 30), "yyyy-MM-dd");
        const recentProduction = format(subDays(new Date(), 1), "yyyy-MM-dd");
        
        mockCattle = [
          { id: "cow-1", tag_number: "C001", lactation_status: "lactating", status: "active" },
        ];
        mockBreedingRecords = [
          {
            cattle_id: "cow-1",
            record_type: "pregnancy_check",
            record_date: "2024-01-01",
            pregnancy_confirmed: true,
            expected_calving_date: expectedCalving,
          },
        ];
        mockProduction = [
          { cattle_id: "cow-1", production_date: recentProduction },
        ];
        
        const { result } = renderHook(() => useCattleStatusAutomation());
        
        const automationResult = await result.current.runAutomation();
        
        // Should be set to dry (dry-off rule) even though there's recent production
        expect(automationResult.updated).toBe(1);
        expect(mockUpdate).toHaveBeenCalledWith({ lactation_status: "dry" });
      });
    });
  });
});
