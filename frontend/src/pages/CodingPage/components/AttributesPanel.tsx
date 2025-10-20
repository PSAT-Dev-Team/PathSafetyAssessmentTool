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
  mappings?: AttrMappings;
  panelHeight?: number; // px
  onChange?: (key: string, value: string | number | boolean | null) => void;
  onEdit?: (field: string, value: string | number | boolean | null) => void;
};

/** ====== Group ordering (tab order) ====== */
const GROUP_ORDER = [
  "Facility configuration",
  "Flow & Speed",
  "Facility clear width",
  "Facility surface conditions",
  "Intersection",
  "Others",
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
  Others: [],
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
    } else {
      grouped["Others"].push([k, v]);
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
  mappings = {},
  panelHeight = 420,
  onChange,
  onEdit,
}: Props) {
  const grouped = useMemo(() => (row ? groupEntries(row) : null), [row]);

  // collect groups with fields (for tabs)
  const groupsWithFields = useMemo(() => {
    if (!grouped) return [];
    return GROUP_ORDER.filter((g) => (grouped[g] ?? []).length > 0);
  }, [grouped]);

  const defaultTab = groupsWithFields[0] ?? "Facility configuration";

  if (!row) {
    return (
      <Card.Root h={`${panelHeight}px`} display="flex" flexDirection="column">
        <Card.Header>
          <Heading size="sm">Attributes</Heading>
        </Card.Header>
        <Card.Body>
          <Text color="gray.500">No attributes</Text>
        </Card.Body>
      </Card.Root>
    );
  }

  return (
    <Card.Root h={`${panelHeight}px`} display="flex" flexDirection="column">
      <Card.Header>
        <Heading size="sm">Attributes</Heading>
      </Card.Header>

      {/* Tabs occupy the body; content area scrolls independently */}
      <Card.Body display="flex" flexDir="column" minH={0} p="0">
        <Tabs.Root defaultValue={defaultTab}>
          <Tabs.List px="2" py="2" overflowX="auto" gap="1">
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
                {/* Scrollable area for this tab */}
                <Box minH={0} h={`${panelHeight - 150}px`} overflowY="auto" px="4" py="3">

                  {/* Responsive grid: 1 col on small, 2 cols on md+ */}
                  <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
                    {fields.map(([k, v]) => {
                      const dict = mappings[k];
                      const strVal: string = toDisplayString(v);

                      return (
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
                                  onEdit?.(k, val);
                                }}
                              >
                                {/* Preserve unknown code if present */}
                                {!dict[strVal] && strVal !== "" && (
                                  <option value={strVal}>{`(Unknown) ${strVal}`}</option>
                                )}
                                {Object.entries(dict).map(([code, label]) => (
                                  <option key={code} value={code}>
                                    {label}
                                  </option>
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
