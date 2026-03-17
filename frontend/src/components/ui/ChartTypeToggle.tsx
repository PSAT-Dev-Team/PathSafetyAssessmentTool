import { Box, Flex, Text } from "@chakra-ui/react";
import "./ChartTypeToggle.css";

interface ChartTypeToggleProps {
  chartType: "pie" | "bar";
  onToggle: (type: "pie" | "bar") => void;
}

export function ChartTypeToggle({ chartType, onToggle }: ChartTypeToggleProps) {
  return (
    <Flex gap="4" align="center">
      {/* Pie Chart Toggle */}
      <Box
        className={`chart-toggle ${chartType === "pie" ? "active pie-active" : ""}`}
        onClick={() => onToggle("pie")}
        cursor="pointer"
        userSelect="none"
      >
        <Flex align="center" gap="2" px="6" py="3">
          <Text
            fontSize="sm"
            fontWeight="bold"
            className="toggle-text"
          >
            PIE CHART
          </Text>
          <Box className="toggle-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M12 12 L12 2 A10 10 0 0 1 22 12 Z" fill="currentColor" opacity="0.7"/>
            </svg>
          </Box>
        </Flex>
      </Box>

      {/* Bar Chart Toggle */}
      <Box
        className={`chart-toggle ${chartType === "bar" ? "active bar-active" : ""}`}
        onClick={() => onToggle("bar")}
        cursor="pointer"
        userSelect="none"
      >
        <Flex align="center" gap="2" px="6" py="3">
          <Box className="toggle-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="14" width="4" height="7" fill="currentColor" rx="1"/>
              <rect x="10" y="9" width="4" height="12" fill="currentColor" rx="1"/>
              <rect x="16" y="6" width="4" height="15" fill="currentColor" rx="1"/>
            </svg>
          </Box>
          <Text
            fontSize="sm"
            fontWeight="bold"
            className="toggle-text"
          >
            BAR CHART
          </Text>
        </Flex>
      </Box>
    </Flex>
  );
}
