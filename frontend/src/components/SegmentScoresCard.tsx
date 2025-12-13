import { useMemo } from "react";
import { Box, Flex, Grid, GridItem, Text } from "@chakra-ui/react";

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
    icon: "🚴🚴",
    shortLabel: "BB",
  },
  {
    key: "BP",
    label: "Bicycle-Pedestrian",
    icon: "🚴🚶",
    shortLabel: "BP",
  },
  {
    key: "SB",
    label: "Single-Bicycle",
    icon: "🚴",
    shortLabel: "SB",
  },
  {
    key: "VB",
    label: "Vehicle-Bicycle",
    icon: "🚗🚴",
    shortLabel: "VB",
  },
];

const getBandColor = (score: number): string => {
  if (score < 3) return "#87C424"; // Low - Green
  if (score < 6) return "#FFCC1A"; // Medium - Yellow
  if (score < 10) return "#FF5B1A"; // High - Orange
  return "#CD1AFF"; // Extreme - Purple
};

const getLightBgColor = (score: number): string => {
  if (score < 3) return "#88E788"; // Low - Green
  if (score < 6) return "#FDDA0D"; // Medium - Yellow
  if (score < 10) return "#F54927"; // High - Red
  return "#BF40BF"; // Extreme - Purple
};

const getDarkBgColor = (score: number): string => {
  if (score < 3) return "#88E788"; // Low - Green
  if (score < 6) return "#FDDA0D"; // Medium - Yellow
  if (score < 10) return "#F54927"; // High - Red
  return "#BF40BF"; // Extreme - Purple
};

const getBandLabel = (score: number): string => {
  if (score < 3) return "Low";
  if (score < 6) return "Medium";
  if (score < 10) return "High";
  return "Extreme";
};

const getRiskEmoji = (score: number): string => {
  if (score < 3) return "💯";
  if (score < 6) return "🤔";
  if (score < 10) return "😰";
  return "⚠️";
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
              {/* Icon */}
              <Text fontSize="xl" mb="2">
                {type.icon}
              </Text>

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
            bg={getLightBgColor(totalScore)}
            _dark={{ bg: getDarkBgColor(totalScore) }}
            borderRadius="lg"
            p="4"
            textAlign="center"
            h="140px"
            color="black"
          >
            {/* Risk emoji */}
            <Text fontSize="xl" mb="2">
              {getRiskEmoji(totalScore)}
            </Text>

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
            <Box w="16px" h="16px" borderRadius="md" bg="#88E788" />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Low
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="16px" h="16px" borderRadius="md" bg="#FDDA0D" />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Medium
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="16px" h="16px" borderRadius="md" bg="#F54927" />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              High
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="16px" h="16px" borderRadius="md" bg="#BF40BF" />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Extreme
            </Text>
          </Flex>
        </Grid>
      </Box>
    </Box>
  );
}
