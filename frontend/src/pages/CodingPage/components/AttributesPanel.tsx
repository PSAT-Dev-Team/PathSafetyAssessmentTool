import { Card, CardHeader, CardBody, Heading, Box, Text } from "@chakra-ui/react";

type AttributeRow = Record<string, string | number | boolean | null>;

type Props = {
  row: AttributeRow | null;
  index: number;
  panelHeight?: number; // px
};

export default function AttributesPanel({ row, index, panelHeight = 420 }: Props) {
  return (
    <Card.Root>
      <CardHeader>
        <Heading size="sm">Attributes (index #{index})</Heading>
      </CardHeader>
      <CardBody>
        {row ? (
          <Box
            as="table"
            w="100%"
            fontSize="sm"
            sx={{ borderCollapse: "collapse" }}
            border="1px solid"
            borderColor="gray.200"
            borderRadius="md"
            display="block"
            h={`${panelHeight}px`}
            overflowY="auto"
          >
            <tbody>
              {Object.entries(row).map(([k, v]) => (
                <tr key={k}>
                  <td
                    style={{
                      width: "40%",
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--chakra-colors-gray-100)",
                      fontWeight: 600,
                      background: "var(--chakra-colors-gray-50)",
                      position: "sticky",
                      left: 0,
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
          <Text color="gray.500">No attributes</Text>
        )}
      </CardBody>
    </Card.Root>
  );
}
