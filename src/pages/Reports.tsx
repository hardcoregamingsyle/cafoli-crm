import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

// Colors for charts
const COLORS = [
  "#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#ffc658", "#8dd1e1", "#a4de6c", "#d0ed57"
];

export default function Reports() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedSlice, setSelectedSlice] = useState<{ type: string, value: string } | null>(null);
  
  // Filters state
  const [enabledSources, setEnabledSources] = useState<Record<string, boolean>>({});
  const [enabledStatuses, setEnabledStatuses] = useState<Record<string, boolean>>({
    "Cold": true, "Hot": true, "Mature": true
  });
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>({
    "Relevant": true, "Irrelevant": true, "To be Decided": true
  });

  // Calculate start and end of the selected day (or range if we expanded to range)
  // Requirement: "defaulting to today and not allowing future dates"
  // We'll treat "date" as the single day for the report for now, or maybe a range?
  // "Date filter" usually implies range. Let's support single day for now as per "defaulting to today".
  // If user wants range, we'd need a range picker. Let's stick to single day or maybe a simple "Last 7 days" option?
  // The prompt says "date filter". I'll implement a single date picker that filters for that whole day.
  
  const startDate = date ? startOfDay(date).getTime() : startOfDay(new Date()).getTime();
  const endDate = date ? endOfDay(date).getTime() : endOfDay(new Date()).getTime();

  const stats = useQuery(api.reports.getReportStats, { startDate, endDate });
  
  // Query for details when a slice is clicked
  const detailsLeads = useQuery(api.reports.getLeadsByFilter, 
    selectedSlice ? {
      startDate,
      endDate,
      filterType: selectedSlice.type,
      filterValue: selectedSlice.value
    } : "skip"
  );

  if (stats === undefined) {
    return <div className="p-8 text-center">Loading reports...</div>;
  }

  if (stats === null) {
    return <div className="p-8 text-center">Unable to load reports. Please try refreshing the page.</div>;
  }

  // Filter data based on checkboxes
  const filteredSources = stats.sources.filter(s => enabledSources[s.name] !== false);
  const filteredStatus = stats.status.filter(s => enabledStatuses[s.name] !== false);
  const filteredRelevancy = stats.relevancy.filter(s => enabledTypes[s.name] !== false);
  
  // Initialize sources filter if empty and data exists
  if (Object.keys(enabledSources).length === 0 && stats.sources.length > 0) {
    const initial: Record<string, boolean> = {};
    stats.sources.forEach(s => initial[s.name] = true);
    setEnabledSources(initial);
  }

  const handleSliceClick = (data: any, type: string) => {
    setSelectedSlice({ type, value: data.name });
  };

  const CustomPieChart = ({ data, type, title, filterState, setFilterState }: any) => (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>Click slices for details</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                onClick={(entry) => handleSliceClick(entry, type)}
                cursor="pointer"
              >
                {data.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {filterState && (
          <div className="flex flex-wrap gap-2 justify-center mt-4 mb-2">
            {Object.keys(filterState).map(key => (
              <div key={key} className="flex items-center space-x-2">
                <Checkbox 
                  id={`${type}-${key}`} 
                  checked={filterState[key]} 
                  onCheckedChange={(checked) => setFilterState({...filterState, [key]: checked})}
                />
                <Label htmlFor={`${type}-${key}`} className="text-xs">{key}</Label>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Daily performance metrics and analytics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <CustomPieChart 
          data={filteredSources} 
          type="source" 
          title="Lead Source" 
          filterState={enabledSources}
          setFilterState={setEnabledSources}
        />
        <CustomPieChart 
          data={filteredStatus} 
          type="status" 
          title="Lead Status" 
          filterState={enabledStatuses}
          setFilterState={setEnabledStatuses}
        />
        <CustomPieChart 
          data={filteredRelevancy} 
          type="type" 
          title="Lead Relevancy" 
          filterState={enabledTypes}
          setFilterState={setEnabledTypes}
        />
        
        {stats.assignment.length > 0 && (
          <CustomPieChart 
            data={stats.assignment} 
            type="assignedTo" 
            title="Lead Assignment" 
          />
        )}

        <Card className="flex flex-col col-span-1 md:col-span-2 lg:col-span-1">
          <CardHeader className="items-center pb-0">
            <CardTitle>Follow-up Punctuality</CardTitle>
            <CardDescription>Timeliness of follow-ups</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
             <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.punctuality}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                  >
                    {stats.punctuality.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={
                        entry.name === "Timely-Completed" ? "#4ade80" : 
                        entry.name === "Overdue-Completed" ? "#facc15" : 
                        "#f87171"
                      } />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedSlice} onOpenChange={(open) => !open && setSelectedSlice(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Leads: {selectedSlice?.type} - {selectedSlice?.value}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {detailsLeads ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailsLeads.length > 0 ? (
                    detailsLeads.map((lead) => (
                      <TableRow key={lead._id}>
                        <TableCell className="font-medium">{lead.name}</TableCell>
                        <TableCell>{lead.mobile}</TableCell>
                        <TableCell>{lead.status}</TableCell>
                        <TableCell>{lead.source}</TableCell>
                        <TableCell>{format(lead._creationTime, "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">No leads found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4 text-center">Loading details...</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}