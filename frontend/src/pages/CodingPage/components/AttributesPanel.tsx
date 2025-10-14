import { Card, Heading, Box, Text, NativeSelect, Input, SimpleGrid } from "@chakra-ui/react"; // 🔧 引入 SimpleGrid
import { useMemo } from "react";
import type { AttributeRow, AttrMappings } from "../../../api";

type Props = {
  row: AttributeRow | null;
  mappings?: AttrMappings;
  panelHeight?: number; // px
  onChange?: (key: string, value: string | number | boolean | null) => void;
  onEdit?: (field: string, value: string | number | boolean | null) => void; // ← 新增
};

export default function AttributesPanel({ row, mappings = {}, panelHeight = 420, onChange, onEdit }: Props) {
  const entries = useMemo(() => (row ? Object.entries(row) : []), [row]);

  if (!row) {
    return (
      <Card.Root h={`${panelHeight}px`} display="flex" flexDirection="column">
        <Card.Header><Heading size="sm">Attributes</Heading></Card.Header>
        <Card.Body><Text color="gray.500">No attributes</Text></Card.Body>
      </Card.Root>
    );
  }

  return (
    <Card.Root h={`${panelHeight}px`} display="flex" flexDirection="column">
      <Card.Header>
        <Heading size="sm">Attributes</Heading>
      </Card.Header>

      <Card.Body minH={0} overflowY="auto" pt="2">
        {/* 🔧 用 SimpleGrid 做两列布局：base 1 列，md 及以上 2 列 */}
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
          {entries.map(([k, v]) => {
            const dict = mappings[k];
            const strVal =
              typeof v === "string" ? v :
              typeof v === "number" ? String(v) :
              typeof v === "boolean" ? (v ? "true" : "false") :
              (v ?? "");

            return (
              // 🔧 每个字段是一个网格格子（列内仍是上下布局：标题 + 控件）
              <Box key={k} display="flex" flexDirection="column" gap="1">
                <Text fontSize="xs" color="gray.600" fontWeight="semibold">
                  {k}
                </Text>

                {dict ? (
                  <NativeSelect.Root size="sm" width="100%" mt="auto">
                    <NativeSelect.Field
                      value={strVal}
                      onChange={(e) => {
                        const val = e.target.value === "" ? null : e.target.value;
                        onChange?.(k, val);
                        onEdit?.(k, val);         // ← 新增：同步写回父级 attrs[currentIndex]
                      }}
                    >
                      {!dict[strVal] && strVal !== "" && (
                        <option value={strVal}>{`(Unknown) ${strVal}`}</option>
                      )}
                      {Object.entries(dict).map(([code, label]) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                ) : (
                  <Input
                    size="sm"
                    value={strVal}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const num = Number(raw);
                      const val =
                        raw !== "" && Number.isFinite(num) && /^\d+(\.\d+)?$/.test(raw) ? num : (raw === "" ? null : raw);
                      onChange?.(k, val);
                      onEdit?.(k, val);         // ← 新增：同步写回父级 attrs[currentIndex]
                    }}
                  />
                )}
              </Box>
            );
          })}
        </SimpleGrid>
      </Card.Body>
    </Card.Root>
  );
}
