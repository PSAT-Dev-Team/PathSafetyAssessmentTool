import { Card, Heading, Box, Image, HStack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { Slider } from "../../../components/ui/slider";

type Props = {
  projectName?: string;
  imageRef?: string;
  panelHeight?: number; // px
};

export default function ImagePanel({ projectName, imageRef, panelHeight = 500 }: Props) {
  const [brightness, setBrightness] = useState(100);

  return (
    <Card.Root
      h={`${panelHeight}px`}
      display="flex"
      flexDirection="column"
    >
      <Card.Header>
        <Heading size="sm">Image</Heading>
      </Card.Header>

      <Box px={4} py={2} borderBottomWidth="1px">
        <HStack gap={3}>
          <Text fontSize="sm" minW="80px">Brightness:</Text>
          <Box flex={1}>
            <Slider
              min={0}
              max={200}
              value={[brightness]}
              onValueChange={(details) => setBrightness(details.value[0])}
            />
          </Box>
          <Text fontSize="sm" minW="45px">{brightness}%</Text>
        </HStack>
      </Box>

      <Card.Body minH={0} >
        {imageRef ? (
          <Box
            h="100%"
            w="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Image
              as="img"
              src={`/api/projects/${encodeURIComponent(projectName ?? "")}/images/${encodeURIComponent(imageRef ?? "")}`}
              alt={imageRef ?? "image"}
              maxW="100%"
              maxH="100%"
              objectFit="contain"
              style={{ filter: `brightness(${brightness}%)` }}
            />
          </Box>
        ) : (
          <Box color="gray.400">No Image</Box>
        )}
      </Card.Body>
    </Card.Root>
  );
}
