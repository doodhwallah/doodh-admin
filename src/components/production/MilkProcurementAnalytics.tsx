import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { format, subDays, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { 
  TrendingUp, 
  Droplets, 
  IndianRupee, 
  Users,
  Beaker,
  Calendar,
  PieChartIcon,
  BarChart3
} from "lucide-react";

interface ProcurementRecord {
  id: string;
  procurement_date: string;
  supplier_name: string;
  vendor_id: string | null;
  quantity_liters: number;
  rate_per_liter: number;
  total_amount: number;
  fat_percentage: number | null;
  snf_percentage: number | null;
  payment_status: string;
  paid_amount: number | null;
}

interface DailyTrend {
  date: string;
  quantity: number;
  amount: number;
  avgRate: number;
}

interface VendorStats {
  name: string;
  quantity: number;
  amount: number;
  avgRate: number;
  avgFat: number;
  avgSNF: number;
  transactions: number;
  fatSum?: number;
  snfSum?: number;
  fatCount?: number;
  snfCount?: number;
}

interface QualityMetrics {
  avgFat: number;
  avgSNF: number;
  highQualityPercent: number;
  qualityDistribution: { name: string; value: number; color: string }[];
}

type DateRange = "7d" | "30d" | "90d" | "thisMonth" | "lastMonth";

const COLORS = {
  primary: "hsl(var(--primary))",
  info: "hsl(var(--info))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
};

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

export function MilkProcurementAnalytics() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [procurements, setProcurements] = useState<ProcurementRecord[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [vendorStats, setVendorStats] = useState<VendorStats[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics>({
    avgFat: 0,
    avgSNF: 0,
    highQualityPercent: 0,
    qualityDistribution: [],
  });
  const [summaryStats, setSummaryStats] = useState({
    totalQuantity: 0,
    totalAmount: 0,
    avgRate: 0,
    totalTransactions: 0,
    pendingPayments: 0,
    uniqueVendors: 0,
  });

  const getDateRange = useCallback((range: DateRange) => {
    const today = new Date();
    switch (range) {
      case "7d":
        return { start: subDays(today, 7), end: today };
      case "30d":
        return { start: subDays(today, 30), end: today };
      case "90d":
        return { start: subDays(today, 90), end: today };
      case "thisMonth":
        return { start: startOfMonth(today), end: today };
      case "lastMonth":
        const lastMonth = subMonths(today, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      default:
        return { start: subDays(today, 30), end: today };
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange(dateRange);

    const { data, error } = await supabase
      .from("milk_procurement")
      .select("*")
      .gte("procurement_date", format(start, "yyyy-MM-dd"))
      .lte("procurement_date", format(end, "yyyy-MM-dd"))
      .order("procurement_date", { ascending: true });

    if (error) {
      console.error("Error fetching procurement data:", error);
      setLoading(false);
      return;
    }

    const records = data || [];
    setProcurements(records);

    // Calculate summary stats
    const totalQuantity = records.reduce((sum, r) => sum + Number(r.quantity_liters), 0);
    const totalAmount = records.reduce((sum, r) => sum + Number(r.total_amount), 0);
    const pendingPayments = records
      .filter(r => r.payment_status !== "paid")
      .reduce((sum, r) => sum + (Number(r.total_amount) - Number(r.paid_amount || 0)), 0);
    const uniqueVendors = new Set(records.map(r => r.supplier_name)).size;

    setSummaryStats({
      totalQuantity,
      totalAmount,
      avgRate: totalQuantity > 0 ? totalAmount / totalQuantity : 0,
      totalTransactions: records.length,
      pendingPayments,
      uniqueVendors,
    });

    // Calculate daily trends
    const days = eachDayOfInterval({ start, end });
    const dailyData: DailyTrend[] = days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayRecords = records.filter(r => r.procurement_date === dayStr);
      const quantity = dayRecords.reduce((sum, r) => sum + Number(r.quantity_liters), 0);
      const amount = dayRecords.reduce((sum, r) => sum + Number(r.total_amount), 0);
      return {
        date: format(day, "dd MMM"),
        quantity,
        amount,
        avgRate: quantity > 0 ? amount / quantity : 0,
      };
    });
    setDailyTrends(dailyData);

    // Calculate vendor stats
    const vendorMap = new Map<string, VendorStats>();
    records.forEach(r => {
      const existing = vendorMap.get(r.supplier_name) || {
        name: r.supplier_name,
        quantity: 0,
        amount: 0,
        avgRate: 0,
        avgFat: 0,
        avgSNF: 0,
        transactions: 0,
        fatSum: 0,
        snfSum: 0,
        fatCount: 0,
        snfCount: 0,
      };
      
      existing.quantity += Number(r.quantity_liters);
      existing.amount += Number(r.total_amount);
      existing.transactions += 1;
      
      if (r.fat_percentage) {
        existing.fatSum = (existing.fatSum || 0) + Number(r.fat_percentage);
        existing.fatCount = (existing.fatCount || 0) + 1;
      }
      if (r.snf_percentage) {
        existing.snfSum = (existing.snfSum || 0) + Number(r.snf_percentage);
        existing.snfCount = (existing.snfCount || 0) + 1;
      }
      
      vendorMap.set(r.supplier_name, existing);
    });

    const vendorStatsArray: VendorStats[] = Array.from(vendorMap.values())
      .map(v => ({
        name: v.name.length > 15 ? v.name.substring(0, 15) + "..." : v.name,
        quantity: v.quantity,
        amount: v.amount,
        avgRate: v.quantity > 0 ? v.amount / v.quantity : 0,
        avgFat: v.fatCount > 0 ? v.fatSum / v.fatCount : 0,
        avgSNF: v.snfCount > 0 ? v.snfSum / v.snfCount : 0,
        transactions: v.transactions,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
    
    setVendorStats(vendorStatsArray);

    // Calculate quality metrics
    const recordsWithFat = records.filter(r => r.fat_percentage);
    const recordsWithSNF = records.filter(r => r.snf_percentage);
    const avgFat = recordsWithFat.length > 0
      ? recordsWithFat.reduce((sum, r) => sum + Number(r.fat_percentage), 0) / recordsWithFat.length
      : 0;
    const avgSNF = recordsWithSNF.length > 0
      ? recordsWithSNF.reduce((sum, r) => sum + Number(r.snf_percentage), 0) / recordsWithSNF.length
      : 0;

    // Quality distribution (based on fat %)
    const highQuality = recordsWithFat.filter(r => Number(r.fat_percentage) >= 4.0).length;
    const mediumQuality = recordsWithFat.filter(r => Number(r.fat_percentage) >= 3.5 && Number(r.fat_percentage) < 4.0).length;
    const lowQuality = recordsWithFat.filter(r => Number(r.fat_percentage) < 3.5).length;
    const noData = records.length - recordsWithFat.length;

    setQualityMetrics({
      avgFat,
      avgSNF,
      highQualityPercent: recordsWithFat.length > 0 ? (highQuality / recordsWithFat.length) * 100 : 0,
      qualityDistribution: [
        { name: "Premium (≥4%)", value: highQuality, color: "#10b981" },
        { name: "Standard (3.5-4%)", value: mediumQuality, color: "#f59e0b" },
        { name: "Basic (<3.5%)", value: lowQuality, color: "#ef4444" },
        { name: "No Data", value: noData, color: "#94a3b8" },
      ].filter(d => d.value > 0),
    });

    setLoading(false);
  }, [dateRange, getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Range Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Procurement Analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Track procurement trends, vendor performance, and quality metrics
          </p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-40">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="thisMonth">This Month</SelectItem>
            <SelectItem value="lastMonth">Last Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-info/10 to-info/5 border-info/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Quantity</p>
                <p className="text-2xl font-bold text-info">
                  {summaryStats.totalQuantity.toLocaleString()} L
                </p>
                <p className="text-xs text-muted-foreground">
                  {summaryStats.totalTransactions} transactions
                </p>
              </div>
              <Droplets className="h-8 w-8 text-info/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold text-primary">
                  ₹{summaryStats.totalAmount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Avg: ₹{summaryStats.avgRate.toFixed(2)}/L
                </p>
              </div>
              <IndianRupee className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Vendors</p>
                <p className="text-2xl font-bold text-success">
                  {summaryStats.uniqueVendors}
                </p>
                <p className="text-xs text-muted-foreground">
                  Unique suppliers
                </p>
              </div>
              <Users className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Payments</p>
                <p className="text-2xl font-bold text-warning">
                  ₹{summaryStats.pendingPayments.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Outstanding dues
                </p>
              </div>
              <IndianRupee className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quantity Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Daily Procurement Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyTrends.some(d => d.quantity > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyTrends}>
                  <defs>
                    <linearGradient id="quantityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11 }}
                    interval={dateRange === "7d" ? 0 : "preserveStartEnd"}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`${value.toLocaleString()} L`, "Quantity"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="quantity"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#quantityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No procurement data for selected period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vendor Comparison Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Top Vendors by Quantity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vendorStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={vendorStats} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    tick={{ fontSize: 10 }} 
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "quantity" ? `${value.toLocaleString()} L` : `₹${value.toLocaleString()}`,
                      name === "quantity" ? "Quantity" : "Amount"
                    ]}
                  />
                  <Bar dataKey="quantity" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No vendor data for selected period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quality Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4" />
              Quality Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {qualityMetrics.qualityDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={qualityMetrics.qualityDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {qualityMetrics.qualityDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`${value} entries`, ""]}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                No quality data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quality Metrics Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Beaker className="h-4 w-4" />
              Average Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Average Fat %</span>
                <Badge 
                  variant={qualityMetrics.avgFat >= 4.0 ? "default" : qualityMetrics.avgFat >= 3.5 ? "secondary" : "destructive"}
                  className="text-sm font-bold"
                >
                  {qualityMetrics.avgFat.toFixed(2)}%
                </Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-success h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((qualityMetrics.avgFat / 6) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Average SNF %</span>
                <Badge 
                  variant={qualityMetrics.avgSNF >= 8.5 ? "default" : qualityMetrics.avgSNF >= 8.0 ? "secondary" : "destructive"}
                  className="text-sm font-bold"
                >
                  {qualityMetrics.avgSNF.toFixed(2)}%
                </Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-info h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((qualityMetrics.avgSNF / 10) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Premium Quality Rate</span>
                <span className="text-lg font-bold text-success">
                  {qualityMetrics.highQualityPercent.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Entries with Fat ≥ 4.0%
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Vendor Rate Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4" />
              Rate Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vendorStats.length > 0 ? (
              <div className="space-y-3 max-h-[220px] overflow-y-auto">
                {vendorStats.slice(0, 6).map((vendor, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="text-sm font-medium truncate max-w-[100px]">
                        {vendor.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">₹{vendor.avgRate.toFixed(2)}/L</span>
                      <p className="text-xs text-muted-foreground">{vendor.transactions} txns</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                No vendor data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Amount Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4" />
            Daily Procurement Value (₹)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyTrends.some(d => d.amount > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyTrends}>
                <defs>
                  <linearGradient id="amountGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11 }}
                  interval={dateRange === "7d" ? 0 : "preserveStartEnd"}
                />
                <YAxis 
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, "Amount"]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#amountGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No procurement data for selected period
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
