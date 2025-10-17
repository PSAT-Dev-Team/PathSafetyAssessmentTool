import { Card, Heading, Box, Text, NativeSelect, Input, SimpleGrid, Separator } from "@chakra-ui/react";
import { useMemo } from "react";
import type { AttributeRow, AttrMappings } from "../../../api";

type Props = {
  row: AttributeRow | null;
  mappings?: AttrMappings;
  panelHeight?: number; // px
  onChange?: (key: string, value: string | number | boolean | null) => void;
  onEdit?: (field: string, value: string | number | boolean | null) => void;
};

/** 1) 将“截图里的顺序”固化为分组顺序（标题就是分组名） */
const GROUP_ORDER = [
  "Facility configuration",
  "Flow & Speed",
  "Facility clear width",
  "Facility surface conditions",
  "Intersection",
  "Others",
] as const;

/** 2) 每个分组下的字段“显示名”，按领导给的顺序。
 *   右侧是“规范化键名”（你自己项目里的真实 key），先给出常见写法；不一致就到 KEY_ALIASES 里补。
 */
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
  Others: [], // 自动填充
};

/** 3) 规范化：把各种写法映射到你数据里的真实 key。
 *    左边是“显示名或常见别名”，右边是 row 里的字段 key。
 *    👉 把你项目里的 key 补全到右侧（很关键）。
 */
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

/** 小工具：把 row 的 entries 分配到分组；没命中的进 Others */
function groupEntries(row: AttributeRow) {
  const allEntries = Object.entries(row) as [string, unknown][];
  // 反向索引：真实key -> 所在分组 + 顺序
  const keyToGroup: Record<string, { group: string; order: number }> = {};
  for (const group of GROUP_ORDER) {
    const list = GROUP_RULES[group];
    list.forEach((displayName, i) => {
      const key = KEY_ALIASES[displayName] ?? displayName; // 兜底：显示名就是 key
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

  // 按每个分组内部原始顺序排序（与 GROUP_RULES 中的顺序一致）
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
  return String(v); // number / string / 其他统统转字符串
};


export default function AttributesPanel({ row, mappings = {}, panelHeight = 420, onChange, onEdit }: Props) {
  const grouped = useMemo(() => (row ? groupEntries(row) : null), [row]);

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
      <Card.Header><Heading size="sm">Attributes</Heading></Card.Header>

      <Card.Body minH={0} overflowY="auto" pt="2">
        {GROUP_ORDER.map((groupName, gi) => {
          const fields = grouped![groupName] ?? [];
          if (!fields.length) return null;

          return (
            <Box key={groupName} mb="5">
              {gi !== 0 && <Separator mb="3" />}
              <Text fontSize="sm" fontWeight="bold" mb="2" textDecoration="underline" color="teal.700" >
                {groupName}
              </Text>

              {/* 两列栅格：小屏1列，大屏2列 */}
              <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
                {fields.map(([k, v]) => {
                  const dict = mappings[k];
                  const strVal: string = toDisplayString(v);

                  return (
                    <Box key={k} display="flex" flexDirection="column" gap="1">
                      <Text fontSize="xs" color="gray.600" fontWeight="semibold">{k}</Text>

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
                              raw !== "" && Number.isFinite(num) && /^\d+(\.\d+)?$/.test(raw)
                                ? num
                                : (raw === "" ? null : raw);
                            onChange?.(k, val);
                            onEdit?.(k, val);
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </SimpleGrid>
            </Box>
          );
        })}
      </Card.Body>
    </Card.Root>
  );
}
