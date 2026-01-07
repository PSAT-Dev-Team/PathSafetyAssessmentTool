import { useMemo } from "react";
import { Box, Flex, Grid, GridItem, Text } from "@chakra-ui/react";
import { RISK_BAND_COLORS } from "./colorConstants";

interface SegmentScoresCardProps {
  scores: {
    VB: number;
    BB: number;
    SB: number;
    BP: number;
    "Overall Risk Level"?: number;
    "CycleRAP score"?: number; // Backward compatibility for existing projects
  } | null;
  beforeScores?: {
    VB: number;
    BB: number;
    SB: number;
    BP: number;
    "Overall Risk Level"?: number;
    "CycleRAP score"?: number;
  } | null; // Optional scores for before/after comparison
  showPreviewBackground?: boolean; // If true, show light gray background for preview scores
}

const CRASH_TYPES = [
  {
    key: "BB",
    label: "Bicycle-Bicycle",
    icon: "BB",
    shortLabel: "BB",
  },
  {
    key: "BP",
    label: "Bicycle-Pedestrian",
    icon: "BP",
    shortLabel: "BP",
  },
  {
    key: "SB",
    label: "Single-Bicycle",
    icon: "SB",
    shortLabel: "SB",
  },
  {
    key: "VB",
    label: "Vehicle-Bicycle",
    icon: "VB",
    shortLabel: "VB",
  },
];

const getBandColor = (score: number, type: string): string => {
  // BB, BP, SB use stricter thresholds
  if (['BB', 'BP', 'SB'].includes(type)) {
    if (score < 5) return RISK_BAND_COLORS.LOW;
    if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
    if (score <= 20) return RISK_BAND_COLORS.HIGH;
    return RISK_BAND_COLORS.EXTREME;
  }

  // VB and others (default)
  if (score < 10) return RISK_BAND_COLORS.LOW;
  if (score <= 25) return RISK_BAND_COLORS.MEDIUM;
  if (score <= 60) return RISK_BAND_COLORS.HIGH;
  return RISK_BAND_COLORS.EXTREME;
};

const getLightBgColor = (score: number, type: string): string => {
  if (['BB', 'BP', 'SB'].includes(type)) {
    if (score < 5) return RISK_BAND_COLORS.LOW;
    if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
    if (score <= 20) return RISK_BAND_COLORS.HIGH;
    return RISK_BAND_COLORS.EXTREME;
  }

  if (score < 10) return RISK_BAND_COLORS.LOW;
  if (score <= 25) return RISK_BAND_COLORS.MEDIUM;
  if (score <= 60) return RISK_BAND_COLORS.HIGH;
  return RISK_BAND_COLORS.EXTREME;
};

const getDarkBgColor = (score: number, type: string): string => {
  if (['BB', 'BP', 'SB'].includes(type)) {
    if (score < 5) return RISK_BAND_COLORS.LOW;
    if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
    if (score <= 20) return RISK_BAND_COLORS.HIGH;
    return RISK_BAND_COLORS.EXTREME;
  }

  if (score < 10) return RISK_BAND_COLORS.LOW;
  if (score <= 25) return RISK_BAND_COLORS.MEDIUM;
  if (score <= 60) return RISK_BAND_COLORS.HIGH;
  return RISK_BAND_COLORS.EXTREME;
};

const getBandLabel = (score: number, type: string): string => {
  if (['BB', 'BP', 'SB'].includes(type)) {
    if (score < 5) return "Low";
    if (score <= 10) return "Medium";
    if (score <= 20) return "High";
    return "Extreme";
  }

  if (score < 10) return "Low";
  if (score <= 25) return "Medium";
  if (score <= 60) return "High";
  return "Extreme";
};

export default function SegmentScoresCard({ scores, beforeScores, showPreviewBackground }: SegmentScoresCardProps) {
  const crashTypeScores = useMemo(() => {
    if (!scores) return [];
    return CRASH_TYPES.map((type) => {
      const score = scores[type.key as keyof typeof scores] || 0;
      return {
        ...type,
        score,
        color: getBandColor(score, type.key),
        band: getBandLabel(score, type.key),
      };
    });
  }, [scores]);

  // Handle both new and old column names for backward compatibility
  const totalScore = scores?.["Overall Risk Level"] ?? scores?.["CycleRAP score"] ?? 0;

  // Determine Overall Risk Level color based on the crash type with the highest score
  const getCycleRAPScoreColor = useMemo(() => {
    if (!scores) return RISK_BAND_COLORS.LOW;

    let highestScore = 0;
    let highestScoreColor: string = RISK_BAND_COLORS.LOW;

    CRASH_TYPES.forEach((type) => {
      const score = scores[type.key as keyof typeof scores] || 0;

      if (score > highestScore) {
        highestScore = score;
        highestScoreColor = getBandColor(score, type.key);
      }
    });

    return highestScoreColor;
  }, [scores]);

  if (!scores) {
    return (
      <Box p="6" textAlign="center" bg="gray.50" _dark={{ bg: "gray.700" }} borderRadius="md">
        <Text color="gray.500" _dark={{ color: "gray.400" }}>
          No score data available
        </Text>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column">
      <Box flex="1" />
      <Box flex="0 0 auto">
        <Flex gap="4" justify="space-between" mb="1" align="center">
          <Text fontSize="sm" fontWeight="bold" color="gray.900" _dark={{ color: "white" }}>
            Crash Type Scores
          </Text>
          <Flex gap="2" align="center">
            <Flex align="center" gap="1">
              <Box w="12px" h="12px" borderRadius="sm" bg={RISK_BAND_COLORS.LOW} flexShrink={0} />
              <Text fontSize="2xs" color="gray.700" _dark={{ color: "gray.300" }}>
                Low
              </Text>
            </Flex>
            <Flex align="center" gap="1">
              <Box w="12px" h="12px" borderRadius="sm" bg={RISK_BAND_COLORS.MEDIUM} flexShrink={0} />
              <Text fontSize="2xs" color="gray.700" _dark={{ color: "gray.300" }}>
                Medium
              </Text>
            </Flex>
            <Flex align="center" gap="1">
              <Box w="12px" h="12px" borderRadius="sm" bg={RISK_BAND_COLORS.HIGH} flexShrink={0} />
              <Text fontSize="2xs" color="gray.700" _dark={{ color: "gray.300" }}>
                High
              </Text>
            </Flex>
            <Flex align="center" gap="1">
              <Box w="12px" h="12px" borderRadius="sm" bg={RISK_BAND_COLORS.EXTREME} flexShrink={0} />
              <Text fontSize="2xs" color="gray.700" _dark={{ color: "gray.300" }}>
                Extreme
              </Text>
            </Flex>
          </Flex>
        </Flex>

        <Flex gap="2" align="flex-end">
          {/* 5-column grid with crash type scores + total */}
          <Box flex="1">
            <Grid
              templateColumns="repeat(5, 1fr)"
              gap="1"
            >
              {crashTypeScores.map((type) => {
                const beforeScore = beforeScores ? (beforeScores[type.key as keyof typeof beforeScores] || 0) : null;
                const reduction = beforeScore !== null ? beforeScore - type.score : null;
                const improved = reduction !== null && reduction > 0;

                return (
                  <GridItem key={type.key}>
                    <Flex
                      direction="column"
                      align="center"
                      justify="center"
                      bg={improved && showPreviewBackground ? "gray.50" : getLightBgColor(type.score, type.key)}
                      _dark={{ bg: improved && showPreviewBackground ? "gray.900" : getDarkBgColor(type.score, type.key) }}
                      borderRadius="sm"
                      p="1"
                      textAlign="center"
                      h={reduction !== null ? "65px" : "50px"}
                      color="black"
                    >
                      {/* Label */}
                      <Text fontSize="xs" fontWeight="bold" lineHeight="1">
                        {type.shortLabel}
                      </Text>

                      {/* Score Value */}
                      <Text
                        fontSize="sm"
                        fontWeight="bold"
                      >
                        {type.score.toFixed(1)}
                      </Text>

                      {/* Reduction indicator */}
                      {reduction !== null && improved && (
                        <Text fontSize="2xs" color={improved ? "green.600" : "gray.600"} _dark={{ color: improved ? "green.300" : "gray.400" }} lineHeight="1" mt="0.5">
                          ↓ {reduction.toFixed(2)}
                        </Text>
                      )}
                    </Flex>
                  </GridItem>
                );
              })}

              {/* Total Score */}
              <GridItem>
                {(() => {
                  const beforeTotal = beforeScores ? (beforeScores["Overall Risk Level"] ?? beforeScores["CycleRAP score"] ?? 0) : null;
                  const totalReduction = beforeTotal !== null ? beforeTotal - totalScore : null;
                  const totalImproved = totalReduction !== null && totalReduction > 0;

                  return (
                    <Flex
                      direction="column"
                      align="center"
                      justify="center"
                      bg={totalImproved && showPreviewBackground ? "gray.50" : getCycleRAPScoreColor}
                      _dark={{ bg: totalImproved && showPreviewBackground ? "gray.900" : undefined }}
                      borderRadius="sm"
                      p="1"
                      textAlign="center"
                      h={totalReduction !== null ? "65px" : "50px"}
                      color="black"
                    >
                      {/* Total label */}
                      <Text fontSize="xs" fontWeight="bold" lineHeight="1">
                        CycleRAP Score
                      </Text>

                      {/* Total score value */}
                      <Text
                        fontSize="sm"
                        fontWeight="bold"
                      >
                        {totalScore.toFixed(1)}
                      </Text>

                      {/* Reduction indicator */}
                      {totalReduction !== null && totalImproved && (
                        <Text fontSize="2xs" color={totalImproved ? "green.600" : "gray.600"} _dark={{ color: totalImproved ? "green.300" : "gray.400" }} lineHeight="1" mt="0.5">
                          ↓ {totalReduction.toFixed(2)}
                        </Text>
                      )}
                    </Flex>
                  );
                })()}
              </GridItem>
            </Grid>
          </Box>
        </Flex>
      </Box>
    </Box>
  );
}
