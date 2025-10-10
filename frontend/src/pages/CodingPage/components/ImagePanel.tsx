import { Card, CardHeader, CardBody, Heading, Box, Text, Image } from "@chakra-ui/react";

type Props = {
    projectName?: string;
  imageUrl?: string;
  imageRef?: string;
  panelHeight?: number; // px
};

export default function ImagePanel({ projectName, imageUrl, imageRef, panelHeight = 420 }: Props) {
  return (
    <Card.Root>
      <CardHeader>
        <Heading size="sm">Image</Heading>
        <Text mt="1" color="gray.500" fontSize="sm">
          Image Reference: {imageRef ?? "-"}
        </Text>
      </CardHeader>
      <CardBody>
        <Box
          h={`${panelHeight}px`}
          border="1px solid"
          borderColor="gray.200"
          borderRadius="md"
          display="flex"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
          bg="white"
        >
          {imageUrl ? (
            <Image
              as="img"
              src={`C:/github/PathSafetyAssessmentTool/data/${projectName}/images/${imageRef}`}
              alt={`C:/github/PathSafetyAssessmentTool/data/${projectName}/images/${imageRef}`}
              maxH="100%"
              maxW="100%"
              objectFit="contain"
            />
          ) : (
            <Box color="gray.400">No Image</Box>
          )}
        </Box>
      </CardBody>
    </Card.Root>
  );
}
