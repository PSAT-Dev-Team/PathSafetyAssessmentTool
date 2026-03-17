# API Documentation - Path Safety Assessment Tool (CycleRAP)

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Frontend API Layer](#frontend-api-layer)
3. [Backend API Routes](#backend-api-routes)
4. [Data Models & Serialization](#data-models--serialization)
5. [Service Layer](#service-layer)
6. [Data Flow Patterns](#data-flow-patterns)
7. [Integration Points](#integration-points)
8. [API Request/Response Examples](#api-requestresponse-examples)

---

## Architecture Overview

### Technology Stack
- **Frontend**: React + TypeScript + Chakra UI
- **Backend**: Flask (Python) with Blueprint architecture
- **Data Processing**: Pandas, GeoPandas for spatial data
- **External Integration**: Excel COM automation (Windows) for CycleRAP calculations

### Application Flow
```
Frontend (React) → API Layer (TypeScript) → Backend Routes (Flask)
    → Service Layer (Python) → Data Serialization → File System/Excel
```

---

## Frontend API Layer

### Location
[`frontend/src/api/index.ts`](frontend/src/api/index.ts)

### Core Functions

#### 1. Health Check
```typescript
async function ping(): Promise<{ status: string }>
```
- **Endpoint**: `GET /api/ping`
- **Purpose**: Verify backend connectivity
- **Returns**: `{ status: "ok" }`

#### 2. Project Management

##### List Projects
```typescript
async function fetchProjectList(): Promise<FileResponse>
```
- **Endpoint**: `GET /api/projects`
- **Purpose**: Retrieve all available projects
- **Returns**:
  ```typescript
  { projects: string[] }  // Array of project names
  ```

##### Get Project Details
```typescript
async function fetchProjectDetail(projectName: string): Promise<ProjectDetail>
```
- **Endpoint**: `GET /api/projects/{projectName}`
- **Purpose**: Get project metadata and versions
- **Returns**:
  ```typescript
  {
    name: string,
    versions: string[],    // e.g., ["20250416", "20250417"]
    latest: string         // e.g., "20250417"
  }
  ```

##### Get Project Attributes
```typescript
async function fetchProjectAttributes(projectName: string): Promise<AttributesResponse>
```
- **Endpoint**: `GET /api/projects/{projectName}/versions/latest/attributes`
- **Purpose**: Fetch attributes data for coding interface
- **Returns**:
  ```typescript
  {
    rows: AttributeRow[]  // Array of attribute objects with 41 fields
  }
  ```

##### Get Project Geodata
```typescript
async function fetchProjectGeoJSON(projectName: string): Promise<FeatureCollection>
```
- **Endpoint**: `GET /api/projects/{projectName}/geodata`
- **Purpose**: Retrieve spatial data for map visualization
- **Returns**: GeoJSON FeatureCollection with LineString geometries

#### 3. Attribute Mappings
```typescript
async function fetchAttributeMappings(): Promise<AttrMappings>
```
- **Endpoint**: `GET /api/projects/attribute-mappings`
- **Purpose**: Get numeric-to-text mappings for dropdowns
- **Returns**:
  ```typescript
  {
    "Area type": { "1": "Urban", "2": "Suburban", ... },
    "Facility Type": { "1": "Sidewalk", "2": "Multi-Use Path", ... },
    ...
  }
  ```

#### 4. Data Persistence

##### Save Attributes
```typescript
async function saveAttributes(project: string, rows: AttributeRow[]): Promise<void>
```
- **Endpoint**: `PUT /api/projects/{project}/attributes`
- **Purpose**: Save edited attributes back to server
- **Body**: `{ rows: AttributeRow[] }`

#### 5. Project Creation

##### List Source Folders
```typescript
async function listSourceFolders(opts?: { signal?: AbortSignal }): Promise<string[]>
```
- **Endpoint**: `GET /api/projects/folders`
- **Purpose**: Get available input folders for project creation
- **Returns**: Array of folder names

##### Create Project from Folder
```typescript
async function createProjectFromFolder(
  project_name: string,
  folder_name: string
): Promise<{ ok?: boolean; name?: string }>
```
- **Endpoint**: `POST /api/projects/folders`
- **Purpose**: Create new project from image folder with EXIF extraction
- **Body**: `{ project_name: string, folder_name: string }`

---

## Backend API Routes

### Blueprint Registration
[`backend/app/api/__init__.py`](backend/app/api/__init__.py)

Three main blueprints:
1. **Health** (`/api`) - System health checks
2. **Projects** (`/api/projects`) - Main data operations
3. **CycleRAP** (not fully implemented) - Advanced calculations

### Health Routes
[`backend/app/api/health.py`](backend/app/api/health.py)

#### GET `/api/ping`
- **Handler**: `ping()`
- **Response**: `{ "status": "ok" }`
- **Purpose**: Backend health check

### Projects Routes
[`backend/app/api/projects/routes.py`](backend/app/api/projects/routes.py)

#### Context Initialization
```python
def get_ctx():
    """Lazy initialization of service layer context"""
    if _CTX["ready"]:
        return _CTX

    pm = project_manager()                    # Load configuration
    serializer.data_loader.initialise()       # Init data APIs
    CRI.cycleRAP_interface.initialise(...)   # Init CycleRAP resources

    _CTX.update({"pm": pm, "ready": True})
    return _CTX
```

#### GET `/api/projects`
- **Handler**: `list_projects()`
- **Service**: `project_manager.list_names()`
- **Response**: `{ "projects": [...] }`

#### GET `/api/projects/<project_name>`
- **Handler**: `get_project(project_name)`
- **Service**: `project_manager.project(project_name)`
- **Response**: Project metadata with versions

#### GET `/api/projects/<project_name>/versions/latest/attributes`
- **Handler**: `get_latest_attributes(project_name)`
- **Service**: `project.latest().attributes.df`
- **Response**: `{ "rows": [...] }` (DataFrame converted to dict)

#### GET `/api/projects/<project_name>/geodata`
- **Handler**: `get_geodata(project_name)`
- **Service**: `project.geo_data.df` (GeoDataFrame)
- **Response**: GeoJSON FeatureCollection
- **Transformation**: `gdf.to_json()` → GeoJSON

#### GET `/api/projects/<project_name>/images/<path:filename>`
- **Handler**: `get_project_image(project_name, filename)`
- **Purpose**: Serve project images securely
- **Security**:
  - Uses `safe_join()` to prevent directory traversal
  - Validates path is within images directory
- **Response**: Image file with cache headers

#### GET `/api/projects/attribute-mappings`
- **Handler**: `get_attribute_mappings()`
- **Service**: `serializer.Attributes.CHOICES`
- **Response**: Reverse-mapped dictionary (numeric code → label)
- **Purpose**: Provides dropdown options for frontend

#### PUT `/api/projects/<name>/attributes`
- **Handler**: `update_attributes(name)`
- **Service**: Updates `project.latest().attributes.df`
- **Body**: `{ "rows": [...] }`
- **Side Effect**: Calls `project.save_all()` (may create new version if different day)

#### POST `/api/projects/<project_name>/score`
- **Handler**: `calculate_score(project_name)`
- **Service**: `CRI.cycleRAP_interface.calculate_cycleRAP_score()`
- **Purpose**: Calculate CycleRAP safety scores using Excel macro
- **Requirements**: Windows + Excel + pywin32
- **Response**: `{ "ok": true, "result_rows": [...] }`

#### POST `/api/projects/<project_name>/treatments`
- **Handler**: `evaluate_treatments(project_name)`
- **Service**: `CRI.cycleRAP_interface.evaluate_treatment_suggestions()`
- **Purpose**: Generate treatment recommendations via Excel STM macro
- **Requirements**: Windows + Excel + pywin32
- **Response**: `{ "ok": true, "rows": [...] }`

#### GET `/api/projects/folders`
- **Handler**: `list_input_folders()`
- **Service**: Lists subdirectories in `project_manager.in_path`
- **Response**: `{ "items": ["FolderA", "FolderB", ...] }`

#### POST `/api/projects/folders`
- **Handler**: `create_project_from_folder()`
- **Body**: `{ "project_name": string, "folder_name": string }`
- **Process**:
  1. Extract GPS from EXIF in images (`get_image_folder_geo()`)
  2. Geocode and sample points (`cycleRAP_VA.geoCode()`)
  3. Convert to LineStrings (`cycleRAP_VA.convert_points_to_linestrings()`)
  4. Create project structure and copy images
  5. Register with `project_manager.create_project()`
- **Response**: `{ "ok": true, "name": "..." }`
- **Validation**: Project name cannot contain underscores

---

## Data Models & Serialization

### Core Data Structures
[`backend/app/services/serializer.py`](backend/app/services/serializer.py)

#### Base Architecture
```python
class BaseTable:
    """Base class for all CSV/Excel serializable data structures"""
    - df: pd.DataFrame          # Core data
    - df_dirty: bool            # Track unsaved changes
    - Fields: class             # Column name constants
    - CHOICES: dict             # Enum mappings (where applicable)

    Methods:
    - parse(file_path)          # Load from CSV/Excel/JSON
    - serialize(file_path)      # Save to disk
```

#### 1. Attributes Table
```python
class Attributes(BaseTable):
    """41 CycleRAP attributes per road segment"""

    Fields (41 total):
    - AREA_TYPE_STR = "Area type"
    - FACILITY_TYPE_STR = "Facility Type"
    - ROAD_AADT_STR = "Road AADT"
    - ... (38 more fields)

    CHOICES: Dict mapping field names to enum mappings
    - "Area type" → {"Urban": 1, "Suburban": 2, ...}
    - "Facility Type" → {"Sidewalk": 1, "Multi-Use Path": 2, ...}
```

**Field Categories**:
- Infrastructure: Area type, Facility type, Width, Delineation
- Surface: Loose surface, Deformation, Rails, Obstacles
- Adjacent hazards: Road lanes, Parking, Severe hazards (0-1m and 1-3m zones)
- Geometry: Grade, Curvature
- Intersections: Crossings, Approaches, Facilities
- Traffic: Pedestrian flow, Bicycle flow, AADT, Speed limits

#### 2. Results Table
```python
class Results(BaseTable):
    """CycleRAP risk scores from Excel calculation"""

    Fields:
    - BB_STR = "BB"                         # Bicyclist-Bicyclist risk
    - BP_STR = "BP"                         # Bicyclist-Pedestrian risk
    - SB_STR = "SB"                         # Bicyclist-Severe hazard risk
    - VB_STR = "VB"                         # Vehicle-Bicyclist risk
    - CYCLERAP_SCORE_STR = "CycleRAP score"
    - *_BAND_STR fields                     # Risk bands (Low/Medium/High/Extreme)

    FIELDS_META: Risk category mappings
    - {'Default': 0, 'Low': 1, 'Medium': 2, 'High': 3, 'Extreme': 4}
```

#### 3. Treatment Table
```python
class Treatment(BaseTable):
    """Safety improvement suggestions from Excel STM macro"""

    Fields:
    - IMAGE_REFERENCE_STR = "Image Reference"
    - TREATMENT_RANK_STR = "Treatment Rank"
    - TREATMENT_ID_STR = "Treatment ID"
    - TREATMENT_NAME_STR = "Name"
    - BB_REMEDIED_STR = "BB"                # Remedied scores
    - BP_REMEDIED_STR = "BP"
    - SB_REMEDIED_STR = "SB"
    - VB_REMEDIED_STR = "VB"
    - SCORE_REMEDIED_STR = "CycleRAP score"
```

#### 4. ProjectGeoData
```python
class ProjectGeoData:
    """Spatial data (GeoDataFrame) for road segments"""

    Fields:
    - IMAGE_REFERENCE_STR = "Image Reference"
    - ROAD_NAME_STR = "Road Name"
    - DISTANCE_STR = "Distance (Metres)"
    - LINESTRING_STR = "LineString"         # Shapely LineString geometry

    df: gpd.GeoDataFrame (CRS: EPSG:3414)

    Methods:
    - populate_linestring(geometries)       # Set geometries from GeoSeries
    - serialize(to_dir)                     # Save as GeoPackage (.gpkg)
    - parse(project_path)                   # Load from .gpkg
```

#### 5. ProjectMetadata
```python
class ProjectMetadata:
    """Project-level metadata (non-versioned)"""

    Fields:
    - project_name: str
    - date_created: datetime.date
    - last_updated: datetime.date
    - created_by: str
    - dataset: str                          # Source dataset name
    - progress: int
    - size: int                             # Number of segments
    - tags: list[str]

    Storage: JSON file (project_metadata.json)
```

#### 6. SnapshotMetadata
```python
class SnapshotMetadata(BaseTable):
    """Version-specific coding metadata"""

    Fields:
    - CODER_NAME_STR = "Coder Name"
    - CODING_DATE_STR = "Coding Date"
    - DESCRIPTION_STR = "Description"
    - STATUS_STR = "Status"                 # EDITED/UNEDITED
```

### Field Mappings Reference

#### Area Type
- 1: Urban
- 2: Suburban
- 3: Rural
- 4: Industrial

#### Facility Type
- 1: Sidewalk
- 2: Multi-Use Path
- 3: Off-Road Bicycle Path
- 4: On-road Bicycle Lane
- 5: Road Shoulder
- 6: Mixed Traffic Road Lane

#### Presence Mapping (used by 15+ fields)
- 1: Present
- 2: Not Present

#### Adequacy Mapping
- 1: Adequate
- 2: Inadequate

#### Facility Width
- 1: Very Narrow
- 2: Narrow
- 3: Wide

---

## Service Layer

### Project Manager
[`backend/app/services/project_manager.py`](backend/app/services/project_manager.py)

#### Class: `ProjectVersion`
**Purpose**: Handles specific dated versions of project data

```python
class ProjectVersion:
    path: Path                              # e.g., .../ProjectA/20250416
    date: datetime.date

    Properties (lazy-loaded):
    - snapshot_metadata: SnapshotMetadata
    - attributes: Attributes
    - results: Results
    - treatment: Treatment

    Methods:
    - load_all()                            # Pre-load all properties
    - save_all()                            # Persist dirty DataFrames to disk
```

**File Structure**:
```
ProjectName/
  versions/
    20250416/
      snapshot_metadata.csv
      attributes.csv
      results.csv
      treatment.csv
```

#### Class: `Project`
**Purpose**: Manages project lifecycle and version control

```python
class Project:
    project_path: Path                      # e.g., .../ProjectA
    versions: list[ProjectVersion]          # Sorted by date (newest first)

    Properties (lazy-loaded):
    - metadata: ProjectMetadata             # Project-level info
    - geo_data: ProjectGeoData              # Spatial data (shared across versions)

    Methods:
    - latest() → ProjectVersion             # Get most recent version
    - by_date(yyyymmdd) → ProjectVersion
    - create_new_version() → ProjectVersion # Create version for today
    - save_all()                            # Save metadata + geo + latest version
    - search(filters) → Project             # Filter segments by criteria
```

**Version Logic**:
- Versions are date-based (YYYYMMDD format)
- `save_all()` creates new version if called on different day
- Geo data is shared across all versions (not versioned)

#### Class: `project_manager`
**Purpose**: Application-level project repository

```python
class project_manager:
    des_path: Path                          # Destination/data folder
    src_path: Path                          # Source folder (CycleRAP resources)
    in_path: Path                           # Input folder (for new projects)
    projects: list[Project]                 # All discovered projects

    Methods:
    - _discover_projects()                  # Scan des_path for projects
    - list_names() → list[str]              # Get all project names
    - project(name) → Project               # Get project by name
    - delete_project(name)
    - create_project(title, geo_data, dataset_name)
    - search(filter_input) → list[Project]  # Multi-project search
    - merge_project_list(projects) → Project # Combine multiple projects
```

**Configuration** (config.json):
```json
{
  "destination_folder": "../data",
  "source_folder": "src",
  "in_folder": "../in",
  "CycleRAP_source": "CycleRAP_v2.11.xlsm",
  "capture_frequency": 10,
  "current_project": null
}
```

### CycleRAP Interface
[`backend/app/services/cycleRAP_interface.py`](backend/app/services/cycleRAP_interface.py)

#### Class: `cycleRAP_interface`
**Purpose**: Interface with Excel-based CycleRAP calculation engine

**Platform Requirements**:
- Windows OS
- Microsoft Excel installed
- `pywin32` package (COM automation)
- CycleRAP Excel workbook (v2.11.xlsm)

```python
class cycleRAP_interface:
    source_dir: Path                        # CycleRAP resources directory
    attribute_default_values: dict          # Default attribute values
    treatment_solutions: pd.DataFrame       # Treatment remedy mappings

    Methods:
    - initialise(source_dir)                # Load defaults and treatments
    - calculate_cycleRAP_score(attributes_df) → pd.DataFrame
        • Writes attributes to "Upload_data" sheet
        • Runs "CalculateResults" VBA macro
        • Returns "Risk Results" sheet

    - evaluate_treatment_suggestions(gdf, attributes_df) → Treatment
        • Writes attributes + image refs to Excel
        • Runs "srSTM" VBA macro
        • Returns "STM Results" sheet

    - get_treatment_pairs(treatment_id) → list[tuple]
        • Returns (attribute_index, remedy_code) pairs for a treatment
```

**Excel Automation Flow**:
```python
pythoncom.CoInitialize()
excel = win32.Dispatch('Excel.Application')
wb = excel.Workbooks.Open(file_path)
ws = wb.Worksheets("Upload_data")

# Write data
ws.Range(start_cell, end_cell).Value = data

# Run macro
excel.Application.Run(f"{wb.Name}!MacroName")

# Read results
result_df = pd.read_excel(file_path, sheet_name="Results")

pythoncom.CoUninitialize()
```

**Treatment Solutions** (defaults.json):
28 pre-defined treatments with remedy mappings:
```json
{
  "description": "Upgrade to on-road bicycle lane with light segregation",
  "attribute_1": 14,      // Facility Type
  "code_remedy_1": 4,     // On-road Bicycle Lane
  "attribute_2": 22,      // Light Segregation
  "code_remedy_2": 1,     // Present
  ...
}
```

### CycleRAP Video Analysis
[`backend/app/services/cycleRAP_VA.py`](backend/app/services/cycleRAP_VA.py)

**Purpose**: Extract and process GPS data from GoPro video footage

Key Functions:
- `get_image_folder_geo(folder_path)` - Extract GPS from EXIF tags
- `geoCode(df)` - Reverse geocoding for road names
- `get_geo_points_by_distance(df, min_distance)` - Sample points by distance
- `convert_points_to_linestrings(gdf)` - Convert point sequences to line geometries

---

## Data Flow Patterns

### 1. Project Loading Flow
```
User navigates to /coding/{projectName}
    ↓
CodingPage useEffect fires
    ↓
fetchProjectDetail(projectName)
    → GET /api/projects/{projectName}
    → project_manager.project(projectName)
    → Returns: { name, versions, latest }
    ↓
fetchProjectAttributes(projectName)
    → GET /api/projects/{projectName}/versions/latest/attributes
    → project.latest().attributes.df
    → Returns: { rows: AttributeRow[] }
    ↓
fetchProjectGeoJSON(projectName)
    → GET /api/projects/{projectName}/geodata
    → project.geo_data.df.to_json()
    → Returns: GeoJSON FeatureCollection
    ↓
fetchAttributeMappings()
    → GET /api/projects/attribute-mappings
    → serializer.Attributes.CHOICES (reversed)
    → Returns: { field: { code: label } }
    ↓
State populated → UI renders
```

### 2. Attribute Editing Flow
```
User edits attribute in AttributesPanel
    ↓
Local state updated (editedRow)
    ↓
User clicks Save button
    ↓
saveAttributes(projectName, updatedRows)
    → PUT /api/projects/{projectName}/attributes
    → Body: { rows: [...] }
    ↓
Backend:
    project.latest().attributes.df = pd.DataFrame(rows)
    project.latest().attributes.df_dirty = True
    project.save_all()
        → Checks if today's version exists
        → Creates new version if different day
        → Saves attributes.csv
    ↓
Response: { ok: true }
    ↓
Frontend: Toast success notification
```

### 3. Score Calculation Flow (Windows Only)
```
User clicks "Calculate Score" button
    ↓
POST /api/projects/{projectName}/score
    ↓
Backend:
    1. Load latest attributes
    2. Initialize Excel COM (pythoncom.CoInitialize)
    3. Open CycleRAP workbook
    4. Clear "Upload_data" sheet (rows 2+)
    5. Write attributes_df → sheet (column 13+)
    6. Run macro: "CalculateResults.CalculateResults"
    7. Save workbook
    8. Read "Risk Results" sheet
    9. Update project.latest().results.df
    10. project.save_all()
    11. Close Excel, CoUninitialize
    ↓
Response: { ok: true, result_rows: [...] }
    ↓
Frontend: Display results in UI
```

### 4. Treatment Evaluation Flow (Windows Only)
```
User triggers treatment evaluation
    ↓
POST /api/projects/{projectName}/treatments
    ↓
Backend:
    1. Load latest attributes + geo_data
    2. Initialize Excel COM
    3. Open CycleRAP workbook
    4. Write attributes (column 13+)
    5. Write image references (column 4)
    6. Run macro: "srSTM"
    7. Read "STM Results" sheet
    8. Map to Treatment object
    9. project.latest().treatment = treatment_obj
    10. project.save_all()
    ↓
Response: { ok: true, rows: [...] }
    ↓
Frontend: Display treatment recommendations
```

### 5. Project Creation from Folder Flow
```
User selects folder in CreateProjectPage
    ↓
POST /api/projects/folders
Body: { project_name: "NewProject", folder_name: "Images_20250101" }
    ↓
Backend:
    1. Validate inputs (no underscores, folder exists)
    2. get_image_folder_geo(folder_path)
        → Read EXIF from .jpg files
        → Extract GPS lat/lon
        → Create GeoDataFrame
    3. cycleRAP_VA.geoCode(df)
        → Reverse geocode for road names
    4. cycleRAP_VA.get_geo_points_by_distance(df, min_distance=10)
        → Sample points every 10 meters
    5. cycleRAP_VA.convert_points_to_linestrings(gdf)
        → Convert points to line segments
    6. Create project directory structure
    7. Copy images to {project}/images/
    8. project_manager.create_project(name, geo_data, folder_name)
        → Create metadata
        → Create version/YYYYMMDD/
        → Initialize attributes with defaults
        → Save all files
    9. Append to project_manager.projects
    ↓
Response: { ok: true, name: "NewProject" }
    ↓
Frontend: Redirect to /coding/NewProject
```

### 6. Image Serving Flow
```
ImagePanel requests image
    ↓
GET /api/projects/{projectName}/images/{filename}
    ↓
Backend:
    1. Calculate images_dir: des_path/{project}/images/
    2. Validate directory exists
    3. safe_join(images_dir, filename)  # Prevent directory traversal
    4. Validate file is within images_dir
    5. send_from_directory(images_dir, filename)
        → Cache-Control: public, max-age=86400
    ↓
Response: Image file (JPEG)
    ↓
Frontend: Display in <img> tag
```

---

## Integration Points

### 1. Excel COM Integration (Windows)
**Location**: [`cycleRAP_interface.py`](backend/app/services/cycleRAP_interface.py)

**Dependencies**:
```python
import pythoncom
import win32com.client as win32
```

**Compatibility Layer**: [`platform_compat.py`](backend/app/services/platform_compat.py)
- `check_windows_feature()` - Raises error on non-Windows
- `get_pythoncom()` - Dynamic import with fallback
- `get_excel_client()` - Dynamic import with fallback

**Workbook Structure**:
- **Upload_data** sheet: Input attributes (columns 13+)
- **Risk Results** sheet: Calculated scores
- **STM Results** sheet: Treatment recommendations
- **Macros**: `CalculateResults.CalculateResults`, `srSTM`

### 2. EXIF GPS Extraction
**Location**: [`projects/routes.py:229-256`](backend/app/api/projects/routes.py:229-256)

**Process**:
```python
import exifread

with open(image_path, 'rb') as f:
    tags = exifread.process_file(f, details=False)

lat = dms_to_decimal(
    tags['GPS GPSLatitude'].values,
    tags['GPS GPSLatitudeRef'].printable
)
lon = dms_to_decimal(
    tags['GPS GPSLongitude'].values,
    tags['GPS GPSLongitudeRef'].printable
)
```

**Output**: GeoDataFrame with lat/lon/filename

### 3. Geocoding Service
**Location**: [`cycleRAP_VA.py`](backend/app/services/cycleRAP_VA.py)

**Function**: `geoCode(df)`
- Reverse geocoding for road names
- Integration with external geocoding API
- Adds road name column to DataFrame

### 4. External Data APIs
**Location**: [`serializer.py:378-458`](backend/app/services/serializer.py:378-458)

**Class**: `data_loader`

**APIs**:
- Traffic Flow API (Singapore LTA DataMall)
- Traffic Speed Bands API

**Caching**:
- Daily cache files: `{date}_TrafficFlow.json`
- Auto-cleanup of old cache files
- API key from config.json

**Usage**:
```python
data_loader.initialise()
traffic_flow = data_loader.getTrafficFlow_df()
speed_bands = data_loader.getTrafficSpeedBands_df()
```

---

## API Request/Response Examples

### 1. List Projects
**Request**:
```http
GET /api/projects HTTP/1.1
```

**Response**:
```json
{
  "projects": [
    "Downtown_Survey_2024",
    "Campus_Routes",
    "Coastal_Path"
  ]
}
```

### 2. Get Project Details
**Request**:
```http
GET /api/projects/Downtown_Survey_2024 HTTP/1.1
```

**Response**:
```json
{
  "name": "Downtown_Survey_2024",
  "versions": ["20250415", "20250416", "20250417"],
  "latest": "20250417"
}
```

### 3. Get Attributes
**Request**:
```http
GET /api/projects/Downtown_Survey_2024/versions/latest/attributes HTTP/1.1
```

**Response**:
```json
{
  "rows": [
    {
      "Area type": 1,
      "Facility Type": 2,
      "Facility access": 1,
      "Road AADT": 5000,
      "Road speed limit": 50,
      ...
    },
    {
      "Area type": 2,
      "Facility Type": 4,
      ...
    }
  ]
}
```

### 4. Get Geodata
**Request**:
```http
GET /api/projects/Downtown_Survey_2024/geodata HTTP/1.1
```

**Response**:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[103.851, 1.290], [103.852, 1.291], ...]
      },
      "properties": {
        "Image Reference": "Downtown_001.jpg",
        "Road Name": "Main Street",
        "Distance (Metres)": 25.3
      }
    }
  ]
}
```

### 5. Get Attribute Mappings
**Request**:
```http
GET /api/projects/attribute-mappings HTTP/1.1
```

**Response**:
```json
{
  "Area type": {
    "1": "Urban",
    "2": "Suburban",
    "3": "Rural",
    "4": "Industrial"
  },
  "Facility Type": {
    "1": "Sidewalk",
    "2": "Multi-Use Path",
    "3": "Off-Road Bicycle Path",
    "4": "On-road Bicycle Lane",
    "5": "Road Shoulder",
    "6": "Mixed Traffic Road Lane"
  },
  "Facility access": {
    "1": "Adequate",
    "2": "Inadequate"
  },
  ...
}
```

### 6. Save Attributes
**Request**:
```http
PUT /api/projects/Downtown_Survey_2024/attributes HTTP/1.1
Content-Type: application/json

{
  "rows": [
    {
      "Area type": 2,
      "Facility Type": 4,
      "Facility access": 1,
      ...
    }
  ]
}
```

**Response**:
```json
{
  "ok": true
}
```

### 7. Calculate Scores (Windows Only)
**Request**:
```http
POST /api/projects/Downtown_Survey_2024/score HTTP/1.1
Content-Type: application/json

{
  "attributes": [...]  // Optional: override with custom attributes
}
```

**Response**:
```json
{
  "ok": true,
  "result_rows": [
    {
      "BB": 15.2,
      "BP": 8.5,
      "SB": 22.1,
      "VB": 18.7,
      "CycleRAP score": 64.5,
      "BB Band": "Medium",
      "BP Band": "Low",
      "SB Band": "High",
      "VB Band": "Medium",
      "CycleRAP score Band": "Medium"
    }
  ]
}
```

### 8. Evaluate Treatments (Windows Only)
**Request**:
```http
POST /api/projects/Downtown_Survey_2024/treatments HTTP/1.1
```

**Response**:
```json
{
  "ok": true,
  "rows": [
    {
      "Image Reference": "Downtown_001.jpg",
      "Treatment Rank": 1,
      "Treatment ID": 7,
      "Name": "Upgrade to off-road bicycle path",
      "BB": 8.2,
      "BP": 5.1,
      "SB": 12.3,
      "VB": 9.4,
      "CycleRAP score": 35.0
    }
  ]
}
```

### 9. List Source Folders
**Request**:
```http
GET /api/projects/folders HTTP/1.1
```

**Response**:
```json
{
  "items": [
    "GoPro_20250101",
    "Survey_Downtown",
    "Campus_Images"
  ]
}
```

### 10. Create Project from Folder
**Request**:
```http
POST /api/projects/folders HTTP/1.1
Content-Type: application/json

{
  "project_name": "New Survey 2025",
  "folder_name": "GoPro_20250101"
}
```

**Response**:
```json
{
  "ok": true,
  "name": "New Survey 2025"
}
```

**Error Response** (if project exists):
```json
{
  "error": "Project already exists"
}
```

---

## Error Handling

### Frontend Error Handling
All API functions throw errors with descriptive messages:
```typescript
if (!res.ok) {
  throw new Error(`Failed GET /api/projects/${projectName}`)
}
```

### Backend Error Responses
Standardized error format:
```python
def fail(message, code=400):
    return jsonify({"error": message}), code
```

**Common Error Codes**:
- `400` - Bad request (invalid input)
- `404` - Not found (project/file doesn't exist)
- `409` - Conflict (project already exists)
- `500` - Server error (Excel automation failure, etc.)

### Platform-Specific Errors
Windows-only features check platform and raise descriptive errors:
```python
def check_windows_feature(feature_name: str):
    if os.name != 'nt':
        raise RuntimeError(
            f"{feature_name} is only available on Windows. "
            f"Current platform: {platform.system()}"
        )
```

---

## Security Considerations

### 1. Path Traversal Prevention
Image serving uses `safe_join()` and double validation:
```python
safe_path = safe_join(str(images_dir), filename)
if safe_path is None:
    abort(400, description="Invalid image path")

file_path = Path(safe_path).resolve()
if not str(file_path).startswith(str(images_dir)):
    abort(400, description="Invalid image path")
```

### 2. Input Validation
- Project names: No underscores allowed
- Folder names: Must exist in designated input directory
- Image filenames: Must be within project images directory

### 3. CORS & Cache Control
- Image responses include cache headers
- Conditional requests supported (`conditional=True`)

---

## Performance Optimizations

### 1. Lazy Loading
- Project data loaded on-demand via properties
- DataFrames not loaded until accessed
- Versions discovered only when needed

### 2. Dirty Flag Pattern
All tables track changes with `df_dirty` flag:
```python
@df.setter
def df(self, value):
    self._df = value
    self.df_dirty = True  # Mark for save

def save_all(self):
    if self.df_dirty:
        self.serialize(file_path)
        self.df_dirty = False
```

### 3. Caching
- API data cached daily (traffic flow/speed)
- Image responses cacheable (max-age=86400)
- Project list cached in memory

### 4. Batch Operations
Excel writes use single Range assignment:
```python
# Fast: Single write operation
ws.Range(start_cell, end_cell).Value = data  # 2D array

# Slow: Row-by-row writes (avoided)
for row in data:
    for col, val in enumerate(row):
        ws.Cells(row_idx, col).Value = val
```

---

## Development Notes

### Adding New Attributes
1. Update `Attributes.Fields` class in [`serializer.py`](backend/app/services/serializer.py)
2. Add mapping to `Attributes.CHOICES` if enumerated
3. Update Excel workbook column positions
4. Frontend automatically picks up changes via `/attribute-mappings`

### Adding New API Endpoints
1. Add route handler in [`projects/routes.py`](backend/app/api/projects/routes.py)
2. Add TypeScript function in [`frontend/src/api/index.ts`](frontend/src/api/index.ts)
3. Update this documentation

### Version Migration
When changing data schema:
1. Update serializer classes
2. Write migration script for existing projects
3. Update version compatibility checks

---

## Troubleshooting

### Excel Automation Fails
**Error**: `RuntimeError: CycleRAP calculation failed`
- **Cause**: Windows/Excel/pywin32 not available
- **Solution**: Check platform compatibility, install pywin32
- **Workaround**: Use pre-calculated results for development

### Project Not Found
**Error**: `KeyError: Project not found: {name}`
- **Cause**: Project not in data directory
- **Solution**: Run `project_manager._discover_projects()`
- **Check**: Data directory configuration in config.json

### GeoJSON Rendering Issues
**Error**: Features not displaying on map
- **Cause**: CRS mismatch (expecting EPSG:4326)
- **Solution**: Convert to WGS84 before sending to frontend
- **Debug**: Check `gdf.crs` before `to_json()`

### Image Loading Fails
**Error**: 404 on image requests
- **Cause**: File renamed with prefix or moved
- **Solution**: Check project images directory structure
- **Expected**: `{data}/{project}/images/{prefix}_{filename}.jpg`

---

## Future Enhancements

### Planned Features
1. **REST API Authentication** - JWT tokens for secure access
2. **WebSocket Support** - Real-time updates during long calculations
3. **Async Processing** - Celery tasks for Excel automation
4. **API Versioning** - `/api/v1/` prefix for backwards compatibility
5. **GraphQL Endpoint** - Flexible querying for complex data needs
6. **Export Endpoints** - PDF/CSV/Shapefile export capabilities

### Scalability Improvements
1. Database backend (PostgreSQL + PostGIS) instead of file-based storage
2. Redis caching for frequently accessed data
3. Message queue for background processing
4. Load balancer for multiple backend instances

---

## Related Documentation

- [README.md](README.md) - Project overview
- [PLATFORM_COMPATIBILITY.md](backend/PLATFORM_COMPATIBILITY.md) - Platform-specific features
- [frontend/README.md](frontend/README.md) - Frontend setup
- [backend/README.md](backend/README.md) - Backend setup

---

**Last Updated**: 2025-10-17
**Version**: 1.0
**Maintainer**: Development Team
