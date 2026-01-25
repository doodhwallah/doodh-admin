import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { format, addDays, subDays } from "date-fns";
import { useIntegratedAlerts } from "@/hooks/useIntegratedAlerts";

describe("useIntegratedAlerts", () => {
  const mockCattle = [
    { id: "cow-1", tag_number: "C001", name: "Lakshmi", status: "active", lactation_status: "lactating" },
    { id: "cow-2", tag_number: "C002", name: null, status: "active", lactation_status: "dry" },
    { id: "cow-3", tag_number: "C003", name: "Sold", status: "sold", lactation_status: null },
  ];

  describe("breeding alerts", () => {
    it("should generate calving alert for upcoming calving within 14 days", () => {
      const calvingDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
      
      const breedingRecords = [{
        id: "breed-1",
        cattle_id: "cow-1",
        record_type: "pregnancy_check",
        record_date: "2024-01-01",
        expected_calving_date: calvingDate,
        pregnancy_confirmed: true,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts(breedingRecords, [], mockCattle, [], [])
      );

      expect(result.current.alerts.some(a => 
        a.category === "breeding" && a.title.includes("Calving")
      )).toBe(true);
    });

    it("should generate critical alert for overdue calving", () => {
      const overdueDate = format(subDays(new Date(), 3), "yyyy-MM-dd");
      
      const breedingRecords = [{
        id: "breed-1",
        cattle_id: "cow-1",
        record_type: "pregnancy_check",
        record_date: "2024-01-01",
        expected_calving_date: overdueDate,
        pregnancy_confirmed: true,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts(breedingRecords, [], mockCattle, [], [])
      );

      const calvingAlert = result.current.alerts.find(a => 
        a.category === "breeding" && a.title.includes("Calving")
      );

      expect(calvingAlert?.type).toBe("critical");
    });

    it("should generate dry-off reminder 60 days before calving", () => {
      const calvingDate = format(addDays(new Date(), 55), "yyyy-MM-dd");
      
      const breedingRecords = [{
        id: "breed-1",
        cattle_id: "cow-1", // lactating
        record_type: "pregnancy_check",
        record_date: "2024-01-01",
        expected_calving_date: calvingDate,
        pregnancy_confirmed: true,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts(breedingRecords, [], mockCattle, [], [])
      );

      expect(result.current.alerts.some(a => 
        a.title.includes("Dry-Off")
      )).toBe(true);
    });

    it("should predict heat cycles from last detection", () => {
      // Last heat was 20 days ago, next expected in 1 day
      const lastHeatDate = format(subDays(new Date(), 20), "yyyy-MM-dd");
      
      const breedingRecords = [{
        id: "breed-1",
        cattle_id: "cow-2",
        record_type: "heat_detection",
        record_date: lastHeatDate,
        pregnancy_confirmed: false,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts(breedingRecords, [], mockCattle, [], [])
      );

      expect(result.current.alerts.some(a => 
        a.title.includes("Heat")
      )).toBe(true);
    });

    it("should skip alerts for sold/inactive cattle", () => {
      const calvingDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
      
      const breedingRecords = [{
        id: "breed-1",
        cattle_id: "cow-3", // sold
        record_type: "pregnancy_check",
        record_date: "2024-01-01",
        expected_calving_date: calvingDate,
        pregnancy_confirmed: true,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts(breedingRecords, [], mockCattle, [], [])
      );

      expect(result.current.alerts).toHaveLength(0);
    });
  });

  describe("health alerts", () => {
    it("should generate alert for upcoming vaccination", () => {
      const dueDate = format(addDays(new Date(), 3), "yyyy-MM-dd");
      
      const healthRecords = [{
        id: "health-1",
        cattle_id: "cow-1",
        record_type: "Vaccination",
        title: "FMD Booster",
        next_due_date: dueDate,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], healthRecords, mockCattle, [], [])
      );

      expect(result.current.alerts.some(a => 
        a.category === "health" && a.description.includes("FMD Booster")
      )).toBe(true);
    });

    it("should mark overdue health records as critical", () => {
      const overdueDate = format(subDays(new Date(), 5), "yyyy-MM-dd");
      
      const healthRecords = [{
        id: "health-1",
        cattle_id: "cow-1",
        record_type: "Deworming",
        title: "Monthly Deworming",
        next_due_date: overdueDate,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], healthRecords, mockCattle, [], [])
      );

      const healthAlert = result.current.alerts.find(a => a.category === "health");
      expect(healthAlert?.type).toBe("critical");
    });

    it("should skip health alerts without due date", () => {
      const healthRecords = [{
        id: "health-1",
        cattle_id: "cow-1",
        record_type: "Treatment",
        title: "General Checkup",
        next_due_date: null,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], healthRecords, mockCattle, [], [])
      );

      expect(result.current.alerts.filter(a => a.category === "health")).toHaveLength(0);
    });
  });

  describe("inventory alerts", () => {
    it("should generate warning for low stock", () => {
      const feedInventory = [{
        id: "feed-1",
        name: "Wheat Bran",
        current_stock: 80,
        min_stock_level: 100,
        unit: "kg",
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], mockCattle, feedInventory, [])
      );

      const inventoryAlert = result.current.alerts.find(a => a.category === "inventory");
      expect(inventoryAlert?.type).toBe("warning");
      expect(inventoryAlert?.description).toContain("Wheat Bran");
    });

    it("should generate critical alert for very low stock (<=25%)", () => {
      const feedInventory = [{
        id: "feed-1",
        name: "Green Fodder",
        current_stock: 20,
        min_stock_level: 100,
        unit: "kg",
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], mockCattle, feedInventory, [])
      );

      const inventoryAlert = result.current.alerts.find(a => a.category === "inventory");
      expect(inventoryAlert?.type).toBe("critical");
      expect(inventoryAlert?.title).toContain("Critical");
    });

    it("should not alert when stock is above minimum", () => {
      const feedInventory = [{
        id: "feed-1",
        name: "Cotton Seed",
        current_stock: 150,
        min_stock_level: 100,
        unit: "kg",
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], mockCattle, feedInventory, [])
      );

      expect(result.current.alerts.filter(a => a.category === "inventory")).toHaveLength(0);
    });
  });

  describe("payment alerts", () => {
    it("should generate warning for payments due within 7 days", () => {
      const dueDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
      
      const invoices = [{
        id: "inv-1",
        invoice_number: "INV-001",
        customer_id: "cust-1",
        customer_name: "Test Customer",
        final_amount: 5000,
        paid_amount: 0,
        payment_status: "pending",
        due_date: dueDate,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], mockCattle, [], invoices)
      );

      const paymentAlert = result.current.alerts.find(a => a.category === "payment");
      expect(paymentAlert?.type).toBe("warning");
    });

    it("should generate critical alert for overdue payments", () => {
      const overdueDate = format(subDays(new Date(), 10), "yyyy-MM-dd");
      
      const invoices = [{
        id: "inv-1",
        invoice_number: "INV-001",
        customer_id: "cust-1",
        customer_name: "Late Payer",
        final_amount: 10000,
        paid_amount: 2000,
        payment_status: "partial",
        due_date: overdueDate,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], mockCattle, [], invoices)
      );

      const paymentAlert = result.current.alerts.find(a => a.category === "payment");
      expect(paymentAlert?.type).toBe("critical");
      expect(paymentAlert?.description).toContain("₹8,000"); // Balance
    });

    it("should skip paid invoices", () => {
      const invoices = [{
        id: "inv-1",
        invoice_number: "INV-001",
        customer_id: "cust-1",
        final_amount: 5000,
        paid_amount: 5000,
        payment_status: "paid",
        due_date: format(subDays(new Date(), 5), "yyyy-MM-dd"),
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], mockCattle, [], invoices)
      );

      expect(result.current.alerts.filter(a => a.category === "payment")).toHaveLength(0);
    });
  });

  describe("production alerts", () => {
    it("should generate alert for production anomalies", () => {
      const anomalies = [{
        cattle_id: "cow-1",
        tag_number: "C001",
        date: format(new Date(), "yyyy-MM-dd"),
        expected: 20,
        actual: 8,
        deviation: -60,
        type: "low" as const,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], mockCattle, [], [], anomalies)
      );

      const productionAlert = result.current.alerts.find(a => a.category === "production");
      expect(productionAlert).toBeDefined();
      expect(productionAlert?.title).toContain("Low Production");
    });
  });

  describe("aggregation and sorting", () => {
    it("should count alerts by type correctly", () => {
      const overdueDate = format(subDays(new Date(), 5), "yyyy-MM-dd");
      const upcomingDate = format(addDays(new Date(), 3), "yyyy-MM-dd");
      
      const healthRecords = [
        { id: "h1", cattle_id: "cow-1", record_type: "Vaccination", title: "Overdue", next_due_date: overdueDate },
        { id: "h2", cattle_id: "cow-2", record_type: "Deworming", title: "Upcoming", next_due_date: upcomingDate },
      ];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], healthRecords, mockCattle, [], [])
      );

      expect(result.current.criticalCount).toBe(1);
      expect(result.current.warningCount).toBe(1);
    });

    it("should sort alerts by priority then due date", () => {
      const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
      const nextWeek = format(addDays(new Date(), 7), "yyyy-MM-dd");
      const overdueDate = format(subDays(new Date(), 1), "yyyy-MM-dd");
      
      const healthRecords = [
        { id: "h1", cattle_id: "cow-1", record_type: "Vaccination", title: "Next week", next_due_date: nextWeek },
        { id: "h2", cattle_id: "cow-2", record_type: "Deworming", title: "Tomorrow", next_due_date: tomorrow },
        { id: "h3", cattle_id: "cow-1", record_type: "Checkup", title: "Overdue", next_due_date: overdueDate },
      ];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], healthRecords, mockCattle, [], [])
      );

      // Critical (overdue) should come first
      expect(result.current.alerts[0].title).toContain("Overdue");
    });

    it("should group alerts by category", () => {
      const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
      
      const healthRecords = [
        { id: "h1", cattle_id: "cow-1", record_type: "Vaccination", title: "Vaccine", next_due_date: tomorrow },
      ];
      
      const feedInventory = [
        { id: "f1", name: "Feed", current_stock: 50, min_stock_level: 100, unit: "kg" },
      ];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], healthRecords, mockCattle, feedInventory, [])
      );

      expect(result.current.alertsByCategory.health).toHaveLength(1);
      expect(result.current.alertsByCategory.inventory).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty inputs", () => {
      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], [], [], [])
      );

      expect(result.current.alerts).toHaveLength(0);
      expect(result.current.totalCount).toBe(0);
    });

    it("should include cattle name when available", () => {
      const calvingDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
      
      const breedingRecords = [{
        id: "breed-1",
        cattle_id: "cow-1", // Has name "Lakshmi"
        record_type: "pregnancy_check",
        record_date: "2024-01-01",
        expected_calving_date: calvingDate,
        pregnancy_confirmed: true,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts(breedingRecords, [], mockCattle, [], [])
      );

      expect(result.current.alerts[0].description).toContain("Lakshmi");
    });

    it("should handle cattle without name", () => {
      const calvingDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
      
      const breedingRecords = [{
        id: "breed-1",
        cattle_id: "cow-2", // No name
        record_type: "pregnancy_check",
        record_date: "2024-01-01",
        expected_calving_date: calvingDate,
        pregnancy_confirmed: true,
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts(breedingRecords, [], mockCattle, [], [])
      );

      expect(result.current.alerts[0].description).toContain("C002");
      expect(result.current.alerts[0].description).not.toContain("()");
    });

    it("should handle null stock values", () => {
      const feedInventory = [{
        id: "feed-1",
        name: "Unknown Stock",
        current_stock: null,
        min_stock_level: 100,
        unit: "kg",
      }];

      const { result } = renderHook(() => 
        useIntegratedAlerts([], [], mockCattle, feedInventory, [])
      );

      // Should treat null as 0 stock
      const inventoryAlert = result.current.alerts.find(a => a.category === "inventory");
      expect(inventoryAlert?.type).toBe("critical");
    });
  });
});
