import { Box, Flex, Grid, GridItem, Text } from "@chakra-ui/react";
import ScoreBandPieChart from "./ScoreBandPieChart";

interface OverallTreatmentAnalysisProps {
  /** Band counts for before treatment (from API) */
  beforeBandCounts: {
    VB: Record<number, number>;
    BB: Record<number, number>;
    SB: Record<number, number>;
    BP: Record<number, number>;
  };
  /** Band counts for after treatment (calculated from treated segments) */
  afterBandCounts: {
    VB: Record<number, number>;
    BB: Record<number, number>;
    SB: Record<number, number>;
    BP: Record<number, number>;
  };
}

const CRASH_TYPES = ["BB", "SB", "BP", "VB"] as const;
const CRASH_TYPE_LABELS: Record<string, string> = {
  BB: "Bicycle-Bicycle (BB)",
  SB: "Single-Bicycle (SB)",
  BP: "Bicycle-Pedestrian (BP)",
  VB: "Vehicle-Bicycle (VB)",
};

export default function OverallTreatmentAnalysis({
  beforeBandCounts,
  afterBandCounts,
}: OverallTreatmentAnalysisProps) {
  return (
    <Box
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="md"
      bg="white"
      _dark={{ bg: "gray.800", borderColor: "gray.600" }}
      p="6"
      mt="6"
    >
      {/* Title */}
      <Text
        fontSize="lg"
        fontWeight="bold"
        mb="6"
        color="gray.900"
        _dark={{ color: "white" }}
      >
        Overall Treatment Analysis
      </Text>

      {/* Two-column layout: Before and After */}
      <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap="8">
        {/* Column 1: Before Treatment */}
        <GridItem>
          <Text
            fontSize="md"
            fontWeight="bold"
            mb="4"
            color="gray.700"
            _dark={{ color: "gray.200" }}
          >
            Before Treatment
          </Text>
          <Flex direction="column" gap="6">
            {CRASH_TYPES.map((crashType) => (
              <Box key={`before-${crashType}`}>
                <ScoreBandPieChart
                  crashType={CRASH_TYPE_LABELS[crashType]}
                  bandCounts={beforeBandCounts[crashType]}
                />
              </Box>
            ))}
          </Flex>
        </GridItem>

        {/* Column 2: After Treatment */}
        <GridItem>
          <Text
            fontSize="md"
            fontWeight="bold"
            mb="4"
            color="gray.700"
            _dark={{ color: "gray.200" }}
          >
            After Treatment
          </Text>
          <Flex direction="column" gap="6">
            {CRASH_TYPES.map((crashType) => (
              <Box key={`after-${crashType}`}>
                <ScoreBandPieChart
                  crashType={CRASH_TYPE_LABELS[crashType]}
                  bandCounts={afterBandCounts[crashType]}
                />
              </Box>
            ))}
          </Flex>
        </GridItem>
      </Grid>
    </Box>
  );
}
