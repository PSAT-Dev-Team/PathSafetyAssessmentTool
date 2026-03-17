import { Card, Heading, Box, Image, HStack } from "@chakra-ui/react";
import { useState } from "react";
import { Slider } from "../../../components/ui/slider";

type Props = {
  projectName?: string;
  imageRef?: string;
  panelHeight?: number; // px
};

export default function ImagePanel({
  projectName,
  imageRef,
}: Props) {
  const [brightness, setBrightness] = useState(100);

  return (
    <Card.Root
      h="100%"
      display="flex"
      flexDirection="column"
    >
      <Card.Header borderBottomWidth="1px" py={1} px={3}>
        <HStack gap={2} align="center" w="100%">
          <Heading size="sm">Image Brightness:</Heading>
          <Box flex={1} minW={0}>
            <Slider
              min={0}
              max={200}
              value={[brightness]}
              onValueChange={(details) => setBrightness(details.value[0])}
            />
          </Box>
        </HStack>
      </Card.Header>

      <Card.Body minH={0} p={0}>
        {imageRef ? (
          <Box
            h="100%"
            w="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Image
              key={imageRef}
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
