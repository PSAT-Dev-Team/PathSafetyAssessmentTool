import { useMemo, useEffect, useState } from "react";
import type { AttributeRow } from "../../../api";
import "./AutocodeValidation.css";

/** ====== Group ordering (matches AttributesPanel) ====== */
const GROUP_ORDER = [
  "Facility configuration",
  "Facility clear width",
  "Facility surface conditions",
  "Intersection",
  "Flow & Speed",
] as const;

/** ====== Display fields under each group ====== */
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

type ValidationStats = {
  displayName: string;
  realKey: string;
  totalCount: number;
  unchangedCount: number;
  changedCount: number;
  correctnessPercentage: number;
};

type Props = {
  projectName: string;
  attributes: AttributeRow[];
  panelHeight?: number;
};

export default function AutocodeValidation({
  projectName,
  attributes,
}: Props) {
  const [validationStats, setValidationStats] = useState<Record<string, ValidationStats[]>>({});
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<(typeof GROUP_ORDER)[number]>("Facility configuration");

  // Normalize attribute values to consistent types (convert numeric strings to numbers)
  const normalizeAttributeValues = (attrs: AttributeRow[]): AttributeRow[] => {
    return attrs.map(row => {
      const normalized: AttributeRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined) {
          normalized[key] = value;
        } else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
          // Convert numeric strings to numbers
          normalized[key] = Number(value);
        } else {
          normalized[key] = value;
        }
      }
      return normalized;
    });
  };

  // Load original autocode values from server baseline CSV
  const loadOriginalValues = async (): Promise<AttributeRow[]> => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/baseline`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.rows || [];
    } catch {
      return [];
    }
  };

  // Calculate validation statistics
  useEffect(() => {
    const calculateStats = async () => {
      if (!attributes || attributes.length === 0) {
        setValidationStats({});
        return;
      }

      const newStats: Record<string, ValidationStats[]> = {};

      // Load original values from server
      let originalValues = await loadOriginalValues();

      // If no original values exist, this is the first load - store current as original (normalized)
      if (originalValues.length === 0) {
        try {
          const normalized = normalizeAttributeValues(attributes);
          // Save baseline to server
          await fetch(`/api/projects/${encodeURIComponent(projectName)}/baseline`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: normalized })
          });
          originalValues = normalized;
        } catch {
          console.warn("Failed to store original autocode values");
        }
      }

      // Use loaded original values, or attributes if no originals exist
      const valuesToCompare = originalValues.length > 0 ? originalValues : attributes;

      // Calculate stats for each attribute group
      for (const group of GROUP_ORDER) {
        const fieldList = GROUP_RULES[group];
        if (!fieldList) continue;

        const groupStats: ValidationStats[] = [];

        for (const displayName of fieldList) {
          const realKey = KEY_ALIASES[displayName] ?? displayName;

          // Count unchanged vs changed values
          let unchangedCount = 0;
          let changedCount = 0;

          for (let i = 0; i < attributes.length; i++) {
            const currentValue = attributes[i]?.[realKey];
            const originalValue = valuesToCompare[i]?.[realKey];

            // Determine if value has changed from original
            let isChanged = true;

            // Handle null/undefined as equivalent
            if ((currentValue === null || currentValue === undefined) &&
                (originalValue === null || originalValue === undefined)) {
              isChanged = false;
            }
            // Strict comparison first (same type, same value)
            else if (currentValue === originalValue) {
              isChanged = false;
            }
            // Type-aware comparison for numeric values
            else if (typeof currentValue === 'number' && typeof originalValue === 'string') {
              const parsedOriginal = Number(originalValue);
              if (!Number.isNaN(parsedOriginal) && currentValue === parsedOriginal) {
                isChanged = false;
              }
            }
            else if (typeof currentValue === 'string' && typeof originalValue === 'number') {
              const parsedCurrent = Number(currentValue);
              if (!Number.isNaN(parsedCurrent) && parsedCurrent === originalValue) {
                isChanged = false;
              }
            }

            if (isChanged) {
              changedCount++;
            } else {
              unchangedCount++;
            }
          }

          const totalCount = attributes.length;
          const correctnessPercentage = totalCount > 0 ? (unchangedCount / totalCount) * 100 : 0;

          groupStats.push({
            displayName,
            realKey,
            totalCount,
            unchangedCount,
            changedCount,
            correctnessPercentage,
          });
        }

        newStats[group] = groupStats;
      }

      setValidationStats(newStats);
    };

    calculateStats();
  }, [projectName, attributes, updateTrigger]);

  // Listen for attribute changes from CodingPage
  useEffect(() => {
    const handleAttributeChange = () => {
      // Trigger recalculation on attribute changes
      setUpdateTrigger(prev => prev + 1);
    };

    window.addEventListener("psat:attribute:changed", handleAttributeChange);
    window.addEventListener("psat:save", handleAttributeChange);
    window.addEventListener("psat:scores:updated", handleAttributeChange);

    return () => {
      window.removeEventListener("psat:attribute:changed", handleAttributeChange);
      window.removeEventListener("psat:save", handleAttributeChange);
      window.removeEventListener("psat:scores:updated", handleAttributeChange);
    };
  }, []);

  const groupsWithFields = useMemo(() => {
    return GROUP_ORDER.filter(g => (validationStats[g] ?? []).length > 0);
  }, [validationStats]);

  // Set activeTab to first group when it changes
  useEffect(() => {
    if (groupsWithFields.length > 0 && !groupsWithFields.includes(activeTab)) {
      setActiveTab(groupsWithFields[0]);
    }
  }, [groupsWithFields, activeTab]);

  if (!attributes || attributes.length === 0) {
    return (
      <div className="autocode-validation-panel">
        <div className="autocode-panel-header" onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              Autocode Validation {isExpanded ? '▼' : '▶'}
            </h3>
          </div>
        </div>
        {isExpanded && (
          <div className="autocode-panel-content">
            <p style={{ color: '#999', textAlign: 'center', padding: '1rem' }}>No data available.</p>
          </div>
        )}
      </div>
    );
  }

  const currentStats = validationStats[activeTab] ?? [];

  return (
    <div className="autocode-validation-panel">
      {/* Header */}
      <div className="autocode-panel-header" onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
            Autocode Validation {isExpanded ? '▼' : '▶'}
          </h3>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="autocode-panel-content">
          {/* Tab Buttons */}
          <div className="autocode-tabs">
            {groupsWithFields.map((group) => (
              <button
                key={group}
                className={`autocode-tab-button ${activeTab === group ? 'active' : ''}`}
                onClick={() => setActiveTab(group)}
              >
                {group}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="autocode-tab-content">
            <div className="autocode-grid">
              {currentStats.map((stat) => {
                const statusClass =
                  stat.correctnessPercentage >= 95
                    ? 'excellent'
                    : stat.correctnessPercentage >= 75
                    ? 'good'
                    : 'needs-review';

                return (
                  <div key={stat.realKey} className="autocode-card">
                    <div className="autocode-card-title">{stat.displayName}</div>

                    <div className="autocode-card-stats">
                      <div className={`autocode-badge ${statusClass}`}>
                        {stat.correctnessPercentage.toFixed(1)}%
                      </div>
                      <div className="autocode-changed">
                        {stat.changedCount}/{stat.totalCount} changed
                      </div>
                    </div>

                    <div className="autocode-progress-bar">
                      <div
                        className={`autocode-progress-fill ${statusClass}`}
                        style={{ width: `${stat.correctnessPercentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
