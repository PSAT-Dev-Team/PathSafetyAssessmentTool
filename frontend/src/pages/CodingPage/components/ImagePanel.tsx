import { Card, Heading, Box, Image } from "@chakra-ui/react";

type Props = {
  projectName?: string;
  imageRef?: string;
  panelHeight?: number; // px
};

export default function ImagePanel({ projectName, imageRef, panelHeight = 500 }: Props) {
  return (
    <Card.Root
      h={`${panelHeight}px`}
      display="flex"
      flexDirection="column"
    >
      <Card.Header>
        <Heading size="sm">Image</Heading>
      </Card.Header>

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
            />
          </Box>
        ) : (
          <Box color="gray.400">No Image</Box>
        )}
      </Card.Body>
    </Card.Root>
  );
}
