import { useMemo } from "react";
import { Box, Text, Flex } from "@chakra-ui/react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { RISK_BAND_COLORS } from "./colorConstants";

interface ScoreBandPieChartProps {
  crashType: string;
  bandCounts: Record<number, number>;
  children?: React.ReactNode;
}

const BAND_INFO: Record<number, { label: string; color: string }> = {
  1: { label: "Low", color: RISK_BAND_COLORS.LOW },
  2: { label: "Medium", color: RISK_BAND_COLORS.MEDIUM },
  3: { label: "High", color: RISK_BAND_COLORS.HIGH },
  4: { label: "Extreme", color: RISK_BAND_COLORS.EXTREME },
};

interface ChartDataPoint {
  band: number;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export default function ScoreBandPieChart({
  crashType,
  bandCounts,
  children,
}: ScoreBandPieChartProps) {
  // Transform band counts to chart data
  const chartData: ChartDataPoint[] = useMemo(() => {
    const total = Object.values(bandCounts).reduce((sum, count) => sum + count, 0);

    return Object.entries(bandCounts)
      .filter(([_, count]) => count > 0) // Only show non-zero bands
      .map(([band, count]) => {
        const bandNum = parseInt(band);
        return {
          band: bandNum,
          label: BAND_INFO[bandNum].label,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
          color: BAND_INFO[bandNum].color,
        };
      })
      .sort((a, b) => a.band - b.band); // Sort by band number
  }, [bandCounts]);

  const total = useMemo(
    () => chartData.reduce((sum, d) => sum + d.count, 0),
    [chartData]
  );

  // Custom label showing percentages inside pie slices
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // Don't show label for extremely small slices (less than 1%)
    if (percent < 0.01) return null;

    return (
      <text
        x={x}
        y={y}
        fill="black"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize="16"
        fontWeight="900"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Empty state
  if (chartData.length === 0) {
    return (
      <Box
        p="4"
        textAlign="center"
        borderWidth="1px"
        borderRadius="md"
        bg="gray.50"
        _dark={{ bg: "gray.700" }}
      >
        <Text color="gray.500" fontSize="sm" _dark={{ color: "gray.400" }}>
          No data for {crashType}
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      {/* Title */}
      <Text
        fontSize="md"
        fontWeight="bold"
        textAlign="center"
        mb="2"
        color="gray.900"
        _dark={{ color: "white" }}
      >
        {crashType}
      </Text>
      <Text
        fontSize="sm"
        color="gray.600"
        _dark={{ color: "gray.400" }}
        textAlign="center"
        mb="4"
      >
        Total: {total} segments
      </Text>

      {/* Pie Chart Container with Legend (Stacked Vertically) */}
      <Flex direction="column" align="center" width="100%">
        {/* Chart */}
        <Box h="250px" w="100%" maxW="300px" display="flex" justifyContent="center" alignItems="center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderLabel}
                outerRadius="90%"
                innerRadius="40%"
                dataKey="count"
                animationDuration={800}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>

              {/* Tooltip */}
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as ChartDataPoint;
                    return (
                      <Box
                        bg="white"
                        _dark={{ bg: "gray.900" }}
                        p="3"
                        borderRadius="md"
                        boxShadow="lg"
                        borderWidth="2px"
                        borderColor={data.color}
                      >
                        <Text
                          fontWeight="bold"
                          color={data.color}
                          mb="1"
                        >
                          {data.label}
                        </Text>
                        <Text fontSize="sm" color="gray.700" _dark={{ color: "gray.200" }}>
                          Count: {data.count}
                        </Text>
                        <Text
                          fontSize="sm"
                          fontWeight="bold"
                          color={data.color}
                        >
                          {data.percentage.toFixed(1)}%
                        </Text>
                      </Box>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Box>

        {/* Legend Below Chart */}
        <Flex gap="3" flexWrap="wrap" justify="center" mt="2">
          {chartData.map((item, index) => (
            <Flex
              key={`legend-${index}`}
              align="center"
              gap="2"
              fontSize="xs"
              color="black"
              _dark={{ color: "white" }}
            >
              <Box w="12px" h="12px" borderRadius="full" bg={item.color} flexShrink={0} />
              <Text fontSize="xs" fontWeight="bold">{item.label}: {item.count}</Text>
            </Flex>
          ))}
        </Flex>

        {/* Optional children (e.g., helper text) */}
        {children}
      </Flex>
    </Box>
  );
}
