import { Card, CardHeader, CardBody, Heading, Text, Box } from "@chakra-ui/react";
import type { Feature, LineString } from "geojson";

type Props = {
  feature: Feature<LineString, any> | null;
  index: number;
};

export default function GeoDataPanel({ feature, index }: Props) {
  return (
    <Card.Root>
      <CardHeader>
        <Heading size="sm">Geodata (index #{index})</Heading>
        <Text mt="1" color="gray.500" fontSize="sm">
          id: {feature?.id ?? "-"} · Road: {feature?.properties?.["Road Name"] ?? "-"} · Distance (m):{" "}
          {feature?.properties?.["Distance (Metres)"] ?? "-"}
        </Text>
      </CardHeader>
      <CardBody>
        <Heading size="xs" mb="2">Properties</Heading>
        {feature?.properties ? (
          <Box as="table" w="100%" fontSize="sm" sx={{ borderCollapse: "collapse" }} mb="4">
            <tbody>
              {Object.entries(feature.properties).map(([k, v]) => (
                <tr key={k}>
                  <td
                    style={{
                      width: "40%",
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--chakra-colors-gray-100)",
                      fontWeight: 600,
                      background: "var(--chakra-colors-gray-50)",
                    }}
                  >
                    {k}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--chakra-colors-gray-100)",
                    }}
                  >
                    {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </Box>
        ) : (
          <Text color="gray.500" mb="4">No properties</Text>
        )}

        <Heading size="xs" mb="2">Geometry (SVY21)</Heading>
        {feature?.geometry?.type === "LineString" ? (
          <Box
            as="pre"
            p="3"
            bg="gray.50"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="md"
            maxH="260px"
            overflow="auto"
            fontSize="xs"
          >
            {JSON.stringify(feature.geometry.coordinates, null, 2)}
          </Box>
        ) : (
          <Text color="gray.500">No geometry</Text>
        )}
      </CardBody>
    </Card.Root>
  );
}
