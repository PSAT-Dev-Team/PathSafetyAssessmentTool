import { useMemo } from "react";
import { Box, Flex, Grid, GridItem, Text } from "@chakra-ui/react";
import { RISK_BAND_COLORS } from "./colorConstants";

interface SegmentScoresCardProps {
  scores: {
    VB: number;
    BB: number;
    SB: number;
    BP: number;
    "CycleRAP score": number;
  } | null;
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

const getBandColor = (score: number): string => {
  if (score <= 5) return RISK_BAND_COLORS.LOW;
  if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
  if (score <= 20) return RISK_BAND_COLORS.HIGH;
  return RISK_BAND_COLORS.EXTREME;
};

const getLightBgColor = (score: number): string => {
  if (score <= 5) return RISK_BAND_COLORS.LOW;
  if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
  if (score <= 20) return RISK_BAND_COLORS.HIGH;
  return RISK_BAND_COLORS.EXTREME;
};

const getDarkBgColor = (score: number): string => {
  if (score <= 5) return RISK_BAND_COLORS.LOW;
  if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
  if (score <= 20) return RISK_BAND_COLORS.HIGH;
  return RISK_BAND_COLORS.EXTREME;
};

const getBandLabel = (score: number): string => {
  if (score <= 5) return "Low";
  if (score <= 10) return "Medium";
  if (score <= 20) return "High";
  return "Extreme";
};

export default function SegmentScoresCard({ scores }: SegmentScoresCardProps) {
  const crashTypeScores = useMemo(() => {
    if (!scores) return [];
    return CRASH_TYPES.map((type) => {
      const score = scores[type.key as keyof typeof scores] || 0;
      return {
        ...type,
        score,
        color: getBandColor(score),
        band: getBandLabel(score),
      };
    });
  }, [scores]);

  const totalScore = scores?.["CycleRAP score"] ?? 0;

  // Determine CycleRAP Score color based on the crash type with the highest score
  const getCycleRAPScoreColor = useMemo(() => {
    if (!scores) return RISK_BAND_COLORS.LOW;

    let highestScore = 0;
    let highestScoreColor: string = RISK_BAND_COLORS.LOW;

    CRASH_TYPES.forEach((type) => {
      const score = scores[type.key as keyof typeof scores] || 0;

      if (score > highestScore) {
        highestScore = score;
        highestScoreColor = getBandColor(score);
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
    <Box>
      <Text fontSize="sm" fontWeight="bold" mb="4" color="gray.900" _dark={{ color: "white" }}>
        Crash Type Scores
      </Text>

      {/* 5-column grid with crash type scores + total */}
      <Grid
        templateColumns="repeat(5, 1fr)"
        gap="4"
        mb="6"
      >
        {crashTypeScores.map((type) => (
          <GridItem key={type.key}>
            <Flex
              direction="column"
              align="center"
              justify="center"
              bg={getLightBgColor(type.score)}
              _dark={{ bg: getDarkBgColor(type.score) }}
              borderRadius="lg"
              p="4"
              textAlign="center"
              h="140px"
              color="black"
            >
              {/* Label */}
              <Text fontSize="xs" fontWeight="bold" mb="3">
                {type.label}
              </Text>

              {/* Score Value */}
              <Text
                fontSize="2xl"
                fontWeight="bold"
                mt="auto"
              >
                {type.score.toFixed(2)}
              </Text>
            </Flex>
          </GridItem>
        ))}

        {/* Total Score */}
        <GridItem>
          <Flex
            direction="column"
            align="center"
            justify="center"
            bg={getCycleRAPScoreColor}
            borderRadius="lg"
            p="4"
            textAlign="center"
            h="140px"
            color="black"
          >
            {/* Total label */}
            <Text fontSize="xs" fontWeight="bold" mb="3">
              CycleRAP Score
            </Text>

            {/* Total score value */}
            <Text
              fontSize="2xl"
              fontWeight="bold"
              mt="auto"
            >
              {totalScore.toFixed(2)}
            </Text>
          </Flex>
        </GridItem>
      </Grid>

      {/* Risk Levels Legend */}
      <Box>
        <Text fontSize="xs" fontWeight="bold" mb="2" color="gray.900" _dark={{ color: "white" }}>
          Risk Levels
        </Text>
        <Grid templateColumns="repeat(4, 1fr)" gap="2">
          <Flex align="center" gap="2">
            <Box w="16px" h="16px" borderRadius="md" bg={RISK_BAND_COLORS.LOW} />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Low
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="16px" h="16px" borderRadius="md" bg={RISK_BAND_COLORS.MEDIUM} />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Medium
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="16px" h="16px" borderRadius="md" bg={RISK_BAND_COLORS.HIGH} />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              High
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="16px" h="16px" borderRadius="md" bg={RISK_BAND_COLORS.EXTREME} />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Extreme
            </Text>
          </Flex>
        </Grid>
      </Box>
    </Box>
  );
}
