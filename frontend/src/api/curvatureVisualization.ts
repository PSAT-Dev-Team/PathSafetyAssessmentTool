// API service for curvature visualization

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface CurvatureVisualizationRequest {
  coords: [number, number][]; // [[lon, lat], ...]
  index?: number; // Optional segment index
}

export interface CurvatureVisualizationResponse {
  ok: boolean;
  point: {
    lon: number;
    lat: number;
  };
  radius: number | null;
  width: number | null;
  curvature: number; // 1 = Sharp Turn, 2 = No Sharp Turn
  circle_geojson: {
    type: string;
    geometry: {
      type: string;
      coordinates: [number, number][][];
    };
    properties: {
      radius_m: number;
      style: {
        color: string;
        weight: number;
        fill: boolean;
      };
    };
  };
  paths: Array<{
    type: string;
    color: [number, number, number];
    coordinates: [number, number][];
    is_analysis_layer: boolean;
  }>;
  layer_used: string | null;
  analysis_window_m: number;
  diagnostics?: {
    min_radius: number;
    total_triplets_checked: number;
    valid_triplets: number;
    skipped_triplets: number;
    min_triplet?: {
      index: number;
      points: [[number, number], [number, number], [number, number]]; // [[x, y], [x, y], [x, y]] in EPSG:3414
      sides: {
        a: number;
        b: number;
        c: number;
      };
      semi_perimeter: number;
      area: number;
      radius: number;
      is_minimum: boolean;
    };
    calculation_steps: {
      step_1: {
        description: string;
        formula: string;
        values: Record<string, string>;
        result: string;
      };
      step_2: {
        description: string;
        formula: string;
        calculation: string;
        result: string;
      };
      step_3: {
        description: string;
        formula: string;
        calculation: string;
        result: string;
      };
      step_4: {
        description: string;
        formula: string;
        calculation: string;
        result: string;
      };
      conclusion: {
        description: string;
        threshold: string;
        result: string;
        classification: string;
      };
    };
  } | null;
}

/**
 * Fetch curvature visualization data for a segment
 *
 * @param projectName - Name of the project
 * @param coords - LineString coordinates [[lon, lat], ...]
 * @param index - Optional segment index
 * @returns Visualization data including map layers, diagnostics, and calculations
 */
export async function fetchCurvatureVisualization(
  projectName: string,
  coords: [number, number][],
  index?: number
): Promise<CurvatureVisualizationResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectName}/curvature/visualize`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ coords, index }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch curvature visualization');
  }

  return await response.json();
}

export default {
  fetchCurvatureVisualization,
};
