// API service for facility width visualization

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface WidthVisualizationRequest {
  coords: [number, number][]; // [[lon, lat], ...]
  index?: number; // Optional segment index
}

export interface WidthVisualizationResponse {
  ok: boolean;
  point: {
    lon: number;
    lat: number;
  };
  width: number | null; // Width in meters
  width_category: number; // 1=Very Narrow, 2=Narrow, 3=Wide
  search_info: {
    found_at_radius: number | null; // meters
    layer_used: string | null; // "cycling" | "shared" | "footpath"
    total_radii_checked: number;
    start_radius: number;
    max_radius: number;
    step: number;
  };
  search_rings: Array<{
    radius: number;
    center: [number, number];
    candidates_by_layer: {
      cycling: number;
      shared: number;
      footpath: number;
    };
    width_locked: boolean;
  }>;
  paths: Array<{
    type: string; // "cycling" | "shared" | "footpath"
    color: [number, number, number]; // RGB
    coordinates: [number, number][]; // [[lon, lat], ...]
    is_analysis_layer: boolean;
    width_value: number | null;
  }>;
  width_distribution: {
    cycling: { min: number | null; max: number | null; count: number };
    shared: { min: number | null; max: number | null; count: number };
    footpath: { min: number | null; max: number | null; count: number };
  };
  category_labels: {
    1: string;
    2: string;
    3: string;
  };
}

/**
 * Fetch facility width visualization data for a segment
 *
 * @param projectName - Name of the project
 * @param coords - LineString coordinates [[lon, lat], ...]
 * @param index - Optional segment index
 * @returns Visualization data including search rings, paths, and width analysis
 */
export async function fetchWidthVisualization(
  projectName: string,
  coords: [number, number][],
  index?: number
): Promise<WidthVisualizationResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectName}/width/visualize`,
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
    throw new Error(error.error || 'Failed to fetch width visualization');
  }

  return await response.json();
}

export default {
  fetchWidthVisualization,
};
