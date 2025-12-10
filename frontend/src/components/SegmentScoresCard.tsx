import { useMemo } from "react";
import { Box, Flex, Grid, GridItem, Text, VStack } from "@chakra-ui/react";

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
    label: "Bicycle × Bicycle",
    icon: "🚴🚴",
  },
  {
    key: "BP",
    label: "Bicycle × Pedestrian",
    icon: "🚴🚶",
  },
  {
    key: "VB",
    label: "Vehicle × Bicycle",
    icon: "🚗🚴",
  },
  {
    key: "SB",
    label: "Single Bicycle",
    icon: "🚴",
  },
];

const getBandColor = (score: number): string => {
  if (score < 3) return "#87C424"; // Low - Green
  if (score < 6) return "#FFCC1A"; // Medium - Yellow
  if (score < 10) return "#FF5B1A"; // High - Orange
  return "#CD1AFF"; // Extreme - Purple
};

const getBandLabel = (score: number): string => {
  if (score < 3) return "Low";
  if (score < 6) return "Medium";
  if (score < 10) return "High";
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
  const totalColor = getBandColor(totalScore);
  const totalBand = getBandLabel(totalScore);

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
    <VStack gap="6" align="stretch">
      {/* Crash Type Scores Grid */}
      <Box>
        <Text fontSize="sm" fontWeight="bold" mb="4" color="gray.900" _dark={{ color: "white" }}>
          Crash Type Scores
        </Text>
        <Grid
          templateColumns={{ base: "1fr 1fr", md: "1fr 1fr" }}
          gap="4"
        >
          {crashTypeScores.map((type) => (
            <GridItem key={type.key}>
              <Flex
                direction="column"
                bg="white"
                borderRadius="md"
                p="4"
                borderWidth="1px"
                borderColor="gray.200"
                boxShadow="0 1px 3px rgba(0, 0, 0, 0.1)"
                _dark={{
                  bg: "gray.800",
                  borderColor: "gray.600",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
                }}
              >
                {/* Icon and Label */}
                <Flex align="center" gap="2" mb="3">
                  <Text fontSize="lg">{type.icon}</Text>
                  <Text fontSize="xs" fontWeight="600" color="gray.700" _dark={{ color: "gray.300" }}>
                    {type.label}
                  </Text>
                </Flex>

                {/* Score Value */}
                <Box
                  bg={type.color}
                  px="3"
                  py="2"
                  borderRadius="md"
                  mb="2"
                >
                  <Text fontSize="xl" fontWeight="bold" color="white">
                    {type.score.toFixed(2)}
                  </Text>
                </Box>

                {/* Band Label */}
                <Text fontSize="xs" fontWeight="600" color="gray.600" _dark={{ color: "gray.400" }}>
                  {type.band}
                </Text>
              </Flex>
            </GridItem>
          ))}
        </Grid>
      </Box>

      {/* CycleRAP Total Score */}
      <Box>
        <Text fontSize="sm" fontWeight="bold" mb="3" color="gray.900" _dark={{ color: "white" }}>
          CycleRAP Score
        </Text>
        <Flex
          direction="column"
          align="center"
          justify="center"
          bg="white"
          borderRadius="md"
          p="6"
          borderWidth="1px"
          borderColor="gray.200"
          boxShadow="0 1px 3px rgba(0, 0, 0, 0.1)"
          _dark={{
            bg: "gray.800",
            borderColor: "gray.600",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
          }}
        >
          <Box
            bg={totalColor}
            px="6"
            py="3"
            borderRadius="md"
            mb="3"
            w="100%"
            textAlign="center"
          >
            <Text fontSize="3xl" fontWeight="bold" color="white">
              {totalScore.toFixed(2)}
            </Text>
          </Box>
          <Text fontSize="sm" fontWeight="600" color="gray.600" _dark={{ color: "gray.400" }}>
            {totalBand}
          </Text>
        </Flex>
      </Box>

      {/* Risk Levels Legend */}
      <Box>
        <Text fontSize="xs" fontWeight="bold" mb="2" color="gray.900" _dark={{ color: "white" }}>
          Risk Levels
        </Text>
        <Grid templateColumns="1fr 1fr" gap="2">
          <Flex align="center" gap="2">
            <Box w="20px" h="20px" borderRadius="md" bg="#87C424" />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Low
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="20px" h="20px" borderRadius="md" bg="#FFCC1A" />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Medium
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="20px" h="20px" borderRadius="md" bg="#FF5B1A" />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              High
            </Text>
          </Flex>
          <Flex align="center" gap="2">
            <Box w="20px" h="20px" borderRadius="md" bg="#CD1AFF" />
            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
              Extreme
            </Text>
          </Flex>
        </Grid>
      </Box>
    </VStack>
  );
}
