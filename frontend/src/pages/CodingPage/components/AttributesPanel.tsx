import { useMemo } from "react";
import type { AttributeRow, AttrMappings } from "../../../api";
import {
  Card,
  Heading,
  Box,
  Text,
  NativeSelect,
  Input,
  SimpleGrid,
  Separator,
  Tabs,
} from "@chakra-ui/react";

/** ====== Props ====== */
type Props = {
  row: AttributeRow | null;
  originalRow?: AttributeRow | null; // Original autocode values for comparison
  mappings?: AttrMappings;
  panelHeight?: number; // px
  onChange?: (key: string, value: string | number | boolean | null) => void;
  onEdit?: (field: string, value: string | number | boolean | null) => void;
  changedFields?: string[]; // Fields that were changed by auto-coding
  fieldSources?: Record<string, string>; // Field name -> "CV" | "GIS"
  readOnly?: boolean; // If true, disable editing (display-only mode)
  headerAction?: React.ReactNode; // Optional action/toggle to display next to "Attributes" heading
  highlightMessage?: string; // Custom message for changed attributes
  highlightColor?: "green" | "yellow";
};

/** ====== Group ordering (tab order) ====== */
const GROUP_ORDER = [
  "Facility configuration",
  "Facility clear width",
  "Facility surface conditions",
  "Intersection",
  "Flow & Speed",
] as const;

/** ====== Display fields under each group (keep your original order) ====== */
const GROUP_RULES: Record<(typeof GROUP_ORDER)[number], string[]> = {
  "Facility configuration": [
    "Facility configuration",
    "Area type",
    "Facility type",
    "Adjacent sidewalk 0-1m",
    "Adjacent sidewalk 1-3m",
    "Adjacent road lane 0-1m",
    "Adjacent road lane 1-3m",
    "Adjacent vehicle parking 0-1m",
    "Adjacent vehicle parking 1-3m",
    "Adjacent object or level change 0-1m",
    "Adjacent object or level change 1-3m",
  ],
  "Flow & Speed": [
    "Flow direction",
    "Peak pedestrian flow along or across",
    "Peak bicycle/LV traffic flow",
    "Obs proportion of cargo bikes",
    "Heavy vehicle flow",
    "Bicycle/LV speed average",
    "Bicycle/LV speed differential",
    "Road AADT",
    "Road Operating speed (mean)",
    "Road Operating speed (unit)",
    "Road speed limit",
  ],
  "Facility clear width": [
    "Facility Access",
    "Fixed obstacle on facility",
    "Non-fixed obstacle on facility",
    "Facility width per direction",
    "Width restrictions",
    "Light segregation",
    "Adjacent severe hazard 0-1m",
    "Adjacent severe hazard 1-3m",
  ],
  "Facility surface conditions": [
    "Delineation",
    "Major surface road deformation",
    "Loose or slippery surface",
    "Grade",
    "Curvature",
    "Tram or train rails",
    "Street lighting",
  ],
  "Intersection": [
    "Intersection approach",
    "Intersection or road crossing",
    "Crossing facility",
    "Property access",
    "Pedestrian crossing",
    "Intersecting bicycle facility",
    "Number of lanes – adjacent road",
    "Number of lanes – intersecting road",
  ],
};

/** ====== Aliases: display name -> real key in row ====== */
const KEY_ALIASES: Record<string, string> = {
  // Facility configuration
  "Facility configuration": "facility_config",
  "Area type": "Area type",
  "Facility type": "Facility Type",
  "Adjacent sidewalk 0-1m": "Adjacent Sidewalk 0-1m",
  "Adjacent sidewalk 1-3m": "Adjacent Sidewalk 1-3m",
  "Adjacent road lane 0-1m": "Adjacent Road Lane 0-1m",
  "Adjacent road lane 1-3m": "Adjacent Road Lane 1-3m",
  "Adjacent vehicle parking 0-1m": "Adjacent Vehicle Parking 0-1m",
  "Adjacent vehicle parking 1-3m": "Adjacent Vehicle Parking 1-3m",
  "Adjacent object or level change 0-1m": "Adjacent object or level change 0-1m",
  "Adjacent object or level change 1-3m": "Adjacent object or level change 1-3m",

  // Flow & Speed
  "Flow direction": "Flow Direction",
  "Peak pedestrian flow along or across": "Peak pedestrian flow along or across facility",
  "Peak bicycle/LV traffic flow": "Peak bicycle/LV traffic flow",
  "Obs proportion of cargo bikes": "Observed proportion of cargo bikes and mopeds",
  "Heavy vehicle flow": "Heavy vehicle flow",
  "Bicycle/LV speed average": "Bicycle/LV speed – average",
  "Bicycle/LV speed differential": "Bicycle/LV speed differential",
  "Road AADT": "Road AADT",
  "Road Operating speed (mean)": "Road operating speed (mean)",
  "Road Operating speed (unit)": "Road operating speed (unit)",
  "Road speed limit": "Road speed limit",

  // Facility clear width
  "Facility Access": "Facility access",
  "Fixed obstacle on facility": "Fixed Obstacle on Facility",
  "Non-fixed obstacle on facility": "Non-Fixed Obstacle on Facility",
  "Facility width per direction": "Facility Width per Direction",
  "Width restrictions": "Width Restriction",
  "Light segregation": "Light Segregation",
  "Adjacent severe hazard 0-1m": "Adjacent Severe Hazard 0-1m",
  "Adjacent severe hazard 1-3m": "Adjacent Severe Hazard 1-3m",

  // Facility surface conditions
  "Delineation": "Delineation",
  "Major surface road deformation": "Major Surface Deformation or Drain Opening",
  "Loose or slippery surface": "Loose or slippery surface",
  "Grade": "Grade",
  "Curvature": "Curvature",
  "Tram or train rails": "Tram or Train Rails",
  "Street lighting": "Street Lighting",

  // Intersection
  "Intersection approach": "Intersection Approach",
  "Intersection or road crossing": "Intersection or Road Crossing",
  "Crossing facility": "Crossing Facility",
  "Property access": "Property Access",
  "Pedestrian crossing": "Pedestrian Crossing",
  "Intersecting bicycle facility": "Intersecting Bicycle Facility",
  "Number of lanes – adjacent road": "Number of lanes – adjacent road",
  "Number of lanes – intersecting road": "Number of lanes – intersecting road",
};

/** ====== Utils ====== */
function groupEntries(row: AttributeRow) {
  const allEntries = Object.entries(row) as [string, unknown][];

  // reverse index: real key -> group & order
  const keyToGroup: Record<string, { group: string; order: number }> = {};
  for (const group of GROUP_ORDER) {
    const list = GROUP_RULES[group];
    list.forEach((displayName, i) => {
      const key = KEY_ALIASES[displayName] ?? displayName;
      keyToGroup[key] = { group, order: i };
    });
  }

  const grouped: Record<string, Array<[string, unknown]>> = Object.fromEntries(
    GROUP_ORDER.map((g) => [g, []]),
  );

  for (const [k, v] of allEntries) {
    const hit = keyToGroup[k];
    if (hit) {
      grouped[hit.group].push([k, v]);
    }
  }

  // keep original order as in GROUP_RULES
  for (const g of GROUP_ORDER) {
    grouped[g].sort((a, b) => {
      const oa = keyToGroup[a[0]]?.order ?? 1e9;
      const ob = keyToGroup[b[0]]?.order ?? 1e9;
      return oa - ob;
    });
  }

  return grouped;
}

const toDisplayString = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
};

/** ====== Component ====== */
export default function AttributesPanel({
  row,
  originalRow,
  mappings = {},
  panelHeight = 420,
  onChange,
  onEdit,
  changedFields = [],
  fieldSources = {},
  readOnly = false,
  headerAction,
  highlightMessage = "*Highlighted attributes have been modified from the original values",
  highlightColor = "green",
}: Props) {
  const isYellow = highlightColor === "yellow";
  const changedBg = isYellow ? "yellow.50" : "green.100";
  const changedBorder = isYellow ? "yellow.500" : "green.500";
  const changedText = isYellow ? { base: "yellow.900", _dark: "yellow.200" } : { base: "green.900", _dark: "green.900" };
  const changedInputBg = isYellow ? "#FFFFF0" : "#F0FFF4"; // yellow.50 vs green.50 (approx)
  const changedInputBorder = isYellow ? "#D69E2E" : "#38A169"; // yellow.500 vs green.500

  const grouped = useMemo(() => (row ? groupEntries(row) : null), [row]);

  // Create a Set for fast lookup of changed fields
  const changedFieldsSet = useMemo(() => new Set(changedFields), [changedFields]);

  // Check if a field value differs from the original autocode value
  const isManuallyEdited = (key: string, currentValue: any): boolean => {
    if (!originalRow) return false;
    const originalValue = originalRow[key];

    // Handle null/undefined as equivalent
    if (currentValue === null || currentValue === undefined) {
      return originalValue !== null && originalValue !== undefined;
    }
    if (originalValue === null || originalValue === undefined) {
      return currentValue !== null && currentValue !== undefined;
    }

    // Strict comparison first (same type, same value)
    if (currentValue === originalValue) {
      return false;
    }

    // Type-aware comparison for numeric values
    // If one is a number and one is a string, try numeric comparison
    if (typeof currentValue === 'number' && typeof originalValue === 'string') {
      const parsedOriginal = Number(originalValue);
      if (!Number.isNaN(parsedOriginal) && currentValue === parsedOriginal) {
        return false;
      }
    }
    if (typeof currentValue === 'string' && typeof originalValue === 'number') {
      const parsedCurrent = Number(currentValue);
      if (!Number.isNaN(parsedCurrent) && parsedCurrent === originalValue) {
        return false;
      }
    }

    // If we get here, values are genuinely different
    return true;
  };

  // collect groups with fields (for tabs)
  const groupsWithFields = useMemo(() => {
    if (!grouped) return [];
    return GROUP_ORDER.filter((g) => (grouped[g] ?? []).length > 0);
  }, [grouped]);

  const defaultTab = groupsWithFields[0] ?? "Facility configuration";

  // Check if any fields have been changed (for showing the info text)
  const hasChangedFields = changedFieldsSet.size > 0;

  if (!row) {
    return (
      <Card.Root h={`${panelHeight}px`} display="flex" flexDirection="column">
        <Card.Header display="flex" flexDirection="row" justifyContent="space-between" alignItems="center" gap="2">
          <Heading size="sm" flex="0 0 auto">Attributes</Heading>
          {headerAction}
        </Card.Header>
        <Card.Body>
          <Text color="gray.500">No attributes</Text>
        </Card.Body>
      </Card.Root>
    );
  }

  return (
    <Card.Root minH={`${panelHeight}px`} display="flex" flexDirection="column">
      <Card.Header display="flex" flexDirection="row" justifyContent="space-between" alignItems="center" gap="2">
        <Box display="flex" flexDirection="row" alignItems="baseline" gap="2">
          <Heading size="sm" flex="0 0 auto">Attributes</Heading>
          {hasChangedFields && (
            <Text
              fontSize="xs"
              color="gray.600"
              transition="opacity 0.3s"
            >
              {highlightMessage}
            </Text>
          )}
        </Box>
        {headerAction}
      </Card.Header>

      {/* Tabs occupy the body; content area scrolls independently */}
      <Card.Body display="flex" flexDir="column" minH={0} p="0">
        <Tabs.Root defaultValue={defaultTab}>
          <Tabs.List px="2" py="2" flexWrap="wrap" gap="1">
            {groupsWithFields.map((g) => (
              <Tabs.Trigger key={g} value={g}>
                {g}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* A separator under the tab list for subtle structure */}
          <Separator />

          {groupsWithFields.map((groupName, gi) => {
            const fields = grouped![groupName] ?? [];
            return (
              <Tabs.Content key={groupName} value={groupName}>
                {/* Content area expands naturally */}
                <Box px="4" py="3">

                  {/* Responsive grid: 1 col on small, 2 cols on md+ */}
                  <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
                    {fields.map(([k, v]) => {
                      const dict = mappings[k];
                      const strVal: string = toDisplayString(v);
                      const isChanged = changedFieldsSet.has(k);
                      const isEdited = isManuallyEdited(k, v);
                      const source = fieldSources[k]; // "CV" | "GIS" | undefined

                      return (
                        <Box
                          key={k}
                          display="flex"
                          flexDirection="column"
                          gap="1"
                          p="2"
                          borderRadius="md"
                          bg={isEdited ? "red.50" : isChanged ? changedBg : "transparent"}
                          borderWidth={isEdited || isChanged ? "2px" : "0px"}
                          borderColor={isEdited ? "red.200" : isChanged ? changedBorder : "transparent"}
                          transition="all 0.2s"
                        >
                          <Text
                            fontSize="xs"
                            color={isEdited ? "red.800" : isChanged ? changedText : "gray.600"}
                            fontWeight={isEdited || isChanged ? "bold" : "semibold"}
                          >
                            {k}
                            {isChanged && source && ` ✨ (${source})`}
                            {isEdited && (
                              <Text as="span" color="red.600" fontWeight="bold" ml="1">
                                (Manual Edit Done)
                              </Text>
                            )}
                          </Text>

                          {dict ? (
                            <NativeSelect.Root size="sm" width="100%" mt="auto" disabled={readOnly}>
                              <NativeSelect.Field
                                value={strVal}
                                onChange={(e) => {
                                  let val: string | number | boolean | null = e.target.value === "" ? null : e.target.value;

                                  // Convert to original value's type if needed
                                  if (val !== null && originalRow) {
                                    const originalValue = originalRow[k];
                                    // If original was a number, convert the string to a number
                                    if (typeof originalValue === 'number' && typeof val === 'string' && !Number.isNaN(Number(val))) {
                                      val = Number(val);
                                    }
                                  }

                                  onChange?.(k, val);
                                  onEdit?.(k, val);
                                }}
                                style={{
                                  borderColor: isEdited ? "#E53E3E" : isChanged ? changedInputBorder : undefined,
                                  borderWidth: isEdited || isChanged ? "2px" : undefined,
                                  backgroundColor: isEdited ? "#FFF5F5" : isChanged ? changedInputBg : undefined,
                                }}
                                color={isEdited || isChanged ? "gray.900" : undefined}
                                _dark={{
                                  color: isEdited || isChanged ? "gray.900" : undefined,
                                }}
                              >
                                {/* Preserve unknown code if present (except for Road speed limit) */}
                                {k !== "Road speed limit" && !dict[strVal] && strVal !== "" && (
                                  <option value={strVal}>{`(Unknown) ${strVal}`}</option>
                                )}
                                {
                                  k === "Road speed limit" && dict
                                    ? ['NA', '0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100', '110', '120']
                                      .map(code => {
                                        const label = dict[code];
                                        return label ? (
                                          <option key={code} value={code}>
                                            {label}
                                          </option>
                                        ) : null;
                                      })
                                      .filter(Boolean)
                                    : Object.entries(dict || {}).map(([code, label]) => (
                                      <option key={code} value={code}>
                                        {label}
                                      </option>
                                    ))
                                }
                              </NativeSelect.Field>
                              <NativeSelect.Indicator />
                            </NativeSelect.Root>
                          ) : (
                            <Input
                              size="sm"
                              value={strVal}
                              disabled={readOnly}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const num = Number(raw);
                                const val =
                                  raw !== "" &&
                                    Number.isFinite(num) &&
                                    /^\d+(\.\d+)?$/.test(raw)
                                    ? num
                                    : raw === ""
                                      ? null
                                      : raw;
                                onChange?.(k, val);
                                onEdit?.(k, val);
                              }}
                              borderColor={isEdited ? "red.500" : isChanged ? changedBorder : undefined}
                              borderWidth={isEdited || isChanged ? "2px" : undefined}
                              bg={isEdited ? "red.50" : isChanged ? changedBg : undefined}
                              color={isEdited || isChanged ? "gray.900" : undefined}
                              _dark={{
                                color: isEdited || isChanged ? "gray.900" : undefined,
                              }}
                              _focus={{
                                borderColor: isEdited ? "red.600" : isChanged ? "yellow.600" : "blue.500",
                                boxShadow: isEdited ? "0 0 0 1px var(--chakra-colors-red-600)" : isChanged ? "0 0 0 1px var(--chakra-colors-yellow-600)" : undefined,
                              }}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </SimpleGrid>

                  {/* Subtle spacing and separator before next tab content */}
                  {gi !== groupsWithFields.length - 1 && <Box h="3" />}
                </Box>
              </Tabs.Content>
            );
          })}
        </Tabs.Root>
      </Card.Body>
    </Card.Root>
  );
}
