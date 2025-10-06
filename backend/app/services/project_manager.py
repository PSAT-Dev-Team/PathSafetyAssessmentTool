from __future__ import annotations
import streamlit as st
import re
import os
import json
import datetime
import app.services.global_var as global_var
import app.services.serializer as serializer
import pandas as pd
import shutil
import geopandas as gpd
import app.services.cycleRAP_interface as cycleRAP_interface
import requests
from pathlib import Path
from functools import cached_property
from shapely.geometry import LineString, Point
from shapely import wkt
from app.services.cycleRAP_VA import gdfify, get_full_path

# Handles the specific project version and data
class ProjectVersion:
    STR_SNAPSHOT_METADATA   = "snapshot_metadata.csv"
    STR_ATTRIBUTES          = "attributes.csv"
    STR_RESULTS             = "results.csv"
    STR_TREATMENT           = "treatment.csv"

    def __init__(self, version_path: Path = None):
        self.path = version_path                      # …/ProjectA/20250416
        if version_path is not None:
            self.date = datetime.datetime.strptime(version_path.name, "%Y%m%d").date()
            self._snapshot_metadata : None | serializer.SnapshotMetadata    = None
            self._attributes : None | serializer.Attributes                 = None
            self._treatment : None | serializer.Treatment                   = None
            self._results : None | serializer.Results                       = None

        elif version_path is None:
            self.date = datetime.datetime.now().strftime("%Y%m%d")
            self._snapshot_metadata : serializer.SnapshotMetadata   = serializer.SnapshotMetadata()
            self._attributes        : serializer.Attributes         = serializer.Attributes()
            self._treatment         : serializer.Treatment          = serializer.Treatment()
            self._results           : serializer.Results            = serializer.Results()



    @property
    def snapshot_metadata(self) -> serializer.SnapshotMetadata:
        if self._snapshot_metadata is None:
            snapshot = serializer.SnapshotMetadata()
            snapshot.parse(self.path / self.STR_SNAPSHOT_METADATA)
            self._snapshot_metadata = snapshot
        return self._snapshot_metadata

    @snapshot_metadata.setter
    def snapshot_metadata(self, value: serializer.SnapshotMetadata):
        raise TypeError("metadata must be serializer.SnapshotMetadata")
        if not isinstance(value, serializer.SnapshotMetadata):
            self._snapshot_metadata = value
            self._snapshot_metadata.df_dirty = True
        # print(f"SETTING SNAPSHOT TO {value.df}")

    @property
    def attributes(self) -> serializer.Attributes:
        if self._attributes is None:
            attr = serializer.Attributes()
            attr.parse(self.path / self.STR_ATTRIBUTES)
            self._attributes = attr
        return self._attributes

    @attributes.setter
    def attributes(self, value: serializer.Attributes):
        if not isinstance(value, serializer.Attributes):
            raise TypeError("metadata must be serializer.Attributes")
        self._attributes = value
        self._attributes.df_dirty = True
        # print(f"SETTING ATTRIBUTES TO {value.df}")

    @property
    def results(self) -> serializer.Results:
        if self._results is None:
            res = serializer.Results()
            res.parse(self.path / self.STR_RESULTS)
            self._results = res
        return self._results

    @results.setter
    def results(self, value: serializer.Results):
        if not isinstance(value, serializer.Results):
            raise TypeError("metadata must be serializer.Results")
        self._results = value
        self._results.df_dirty = True
        # print(f"SETTING RESULTS TO {value.df}")

    @property
    def treatment(self) -> serializer.Treatment:
        if self._treatment is None:
            tmp_treatment = serializer.Treatment()
            tmp_treatment.parse(self.path / self.STR_TREATMENT)
            self._treatment = tmp_treatment
        return self._treatment

    @treatment.setter
    def treatment(self, value: serializer.Treatment):
        if not isinstance(value, serializer.Treatment):
            raise TypeError("metadata must be serializer.Treatment")
        self._treatment = value
        self._treatment.df_dirty = True
        # print(f"SETTING TREATMENTS TO {value.df}")

    # ─── Convenience helpers ─────────────────────────────────
    def load_all(self):
        _ = (
            self.snapshot_metadata,
            self.attributes,
            self.results,
            self.treatment,
        )

    def save_all(self):
        if self.snapshot_metadata.df_dirty is True:
            self.snapshot_metadata.serialize(self.path / self.STR_SNAPSHOT_METADATA)
        if self.attributes.df_dirty is True:
            self.attributes.serialize(self.path / self.STR_ATTRIBUTES)
        if self.results.df_dirty is True:
            self.results.serialize(self.path / self.STR_RESULTS)
        if self.treatment.df_dirty is True:
            self.treatment.serialize(self.path / self.STR_TREATMENT)

# In charge of the selection of project versions and project metadata
class Project:
    def __init__(self, project_path: Path = None):
        self.project_path = project_path               #  …/ProjectA
        self._metadata : serializer.ProjectMetadata | None  = None
        self._geo_data : serializer.ProjectGeoData  | None  = None
        self._meta_dirty = False
        self._geo_dirty = False
        self.versions: list[ProjectVersion] = []

        if project_path is None:
            self._metadata : serializer.ProjectMetadata = serializer.ProjectMetadata()
            self._geo_data : serializer.ProjectGeoData  = serializer.ProjectGeoData()
            self.versions.insert(0, ProjectVersion())

    # TODO fix project merge
    def __add__(self, rhs : Project) -> Project:
        raise ValueError("Does not work properly at the moment. Do not use")
        temp_path = None
        merged = Project(temp_path)
        # Merge geo data
        merged._geo_data = serializer.ProjectGeoData()
        merged._geo_data.df = pd.concat([self.geo_data.df, rhs.geo_data.df], ignore_index=True)
        # Merge latest version data
        merged.versions.insert(0, self.latest())
        merged.latest().path = temp_path
        merged.latest()._attributes = serializer.Attributes()
        
        st.write(f"Merging {self.metadata.project_name} and {rhs.metadata.project_name}")
        st.write(f"{self.metadata.project_name}: {self.latest().attributes.df}")
        st.write(f"{rhs.metadata.project_name}: {rhs.latest().attributes.df}")
        merged.latest()._attributes._df = pd.concat([self.latest().attributes.df, rhs.latest().attributes.df], ignore_index=True)
        st.write(merged.latest()._attributes._df)

        return merged

    # ─── Version handling ─────────────────────────────────────
    def _discover_versions(self):
        version_dir = self.project_path / "versions"
        self.versions: list[ProjectVersion] = [
            ProjectVersion(p)
            for p in version_dir.iterdir()
            if p.is_dir() and p.name.isdigit() and len(p.name) == 8
        ]
        self.versions.sort(key=lambda v: v.date, reverse=True)

    def latest(self) -> ProjectVersion:
        if not self.versions:
            self._discover_versions()
            if not self.versions:
                raise ValueError(f"No dated sub-folders in {self.project_path}")
        return self.versions[0]

    def by_date(self, yyyymmdd: str) -> ProjectVersion:
        for v in self.versions:
            if v.path.name == yyyymmdd:
                return v
        raise ValueError(f"{yyyymmdd} not found in {self.project_path}")
    
    def create_new_version(self, version : ProjectVersion = None) -> ProjectVersion:
        yyyymmdd = datetime.datetime.now().strftime("%Y%m%d")
        ver_path = self.project_path / "versions" / yyyymmdd

        # 2) bail out if already present ---------------------------------------
        if ver_path.exists():
            raise FileExistsError(f"Version {yyyymmdd} already exists in {self.project_path}")

        # 3) create the directory ----------------------------------------------
        ver_path.mkdir(parents=True)

        # 4) build ProjectVersion object & register it -------------------------
        if version is not None:
            ver_obj = version
            ver_obj.path = ver_path
        else:
            ver_obj = ProjectVersion(ver_path)

        self.versions.insert(0, ver_obj)

        return ver_obj
    
    def save_all(self):
        if self.latest().date != datetime.date.today():
            self.create_new_version(self.latest())

        self.metadata.serialize(self.project_path)
        if self.geo_data.df_dirty is True:
            self.geo_data.serialize(self.project_path)
        self.latest().save_all()
        return self.project_path
    
    def _delete(self):
        # Delete project directory
        shutil.rmtree(self.project_path, ignore_errors=True)
        
    def search(self, filter_attributes: dict, filter_treatment: dict, filter_results: dict) -> Project:
        # ================================
        # Get dataframes to filter
        # ================================
        attr_df = self.latest().attributes.df
        treatment_df = self.latest().treatment.df
        results_df = self.latest().results.df
        geo_df = self.geo_data.df

        # ================================
        # Apply filters (AND logic between groups)
        # ================================

        # Start with all True masks
        attr_mask = pd.Series([True] * len(attr_df))
        treat_mask = pd.Series([True] * len(treatment_df))
        result_mask = pd.Series([True] * len(results_df))

        def map_labels_to_values(labels, value_map):
            """Helper to normalize single/multi inputs and map to stored values."""
            if not labels:
                return []
            label_list = labels if isinstance(labels, list) else [labels]
            return [value_map[label] for label in label_list if label in value_map]

        # === Filter attributes (OR per field) ===
        for field, labels in filter_attributes.items():
            if labels:
                value_map = serializer.Attributes.CHOICES.get(field, {})
                mapped_values = map_labels_to_values(labels, value_map)
                attr_mask &= attr_df[field].isin(mapped_values)

        # === TODO Filter treatment ===
        for field_key, values in filter_treatment.items():
            field_name = getattr(serializer.Treatment.Fields, field_key, None)
            if field_name and values:
                treat_mask &= treatment_df[field_name].isin(values)

        # === Filter results ===
        for field, labels in filter_results.items():
            if labels:
                if field in serializer.Results.FIELDS_META:
                    value_map = serializer.Results.FIELDS_META[field]
                    mapped_values = map_labels_to_values(labels, value_map)
                else:
                    mapped_values = labels if isinstance(labels, list) else [labels]

                result_mask &= results_df[field].isin(mapped_values)

        # ================================
        # Combine masks with AND across datasets
        # ================================
        combined_mask = attr_mask & result_mask
        selected_indexes = combined_mask[combined_mask].index

        # ================================
        # Package filtered data
        # ================================
        filtered_project = Project()  # No path needed for in-memory filtered version

        # Attributes
        filtered_project.latest()._attributes = serializer.Attributes()
        filtered_project.latest().attributes.df = attr_df.loc[selected_indexes].reset_index(drop=True)

        # Treatment
        filtered_project.latest()._treatment = serializer.Treatment()
        filtered_project.latest().treatment.df = treatment_df
        # filtered_project.latest()._treatment._df = treatment_df.loc[selected_indexes].reset_index(drop=True)

        # Results
        filtered_project.latest()._results = serializer.Results()
        filtered_project.latest().results.df = results_df.loc[selected_indexes].reset_index(drop=True)

        # Geo data
        filtered_project._geo_data = serializer.ProjectGeoData()
        filtered_project.geo_data.df = geo_df.loc[selected_indexes].reset_index(drop=True)
        filtered_project.geo_data.df = filtered_project.geo_data.df.set_geometry("geometry")

        # Metadata
        filtered_project.metadata = self.metadata  # Optionally deepcopy or set as-is

        return filtered_project

    # ─── Project-level metadata (non-versioned) ───────────────    
    @property
    def metadata(self) -> serializer.ProjectMetadata:
        if self._metadata is None:
            meta = serializer.ProjectMetadata()
            meta.parse(self.project_path / "project_metadata.json")
            self._metadata = meta
        return self._metadata

    @metadata.setter
    def metadata(self, value: serializer.ProjectMetadata):
        if not isinstance(value, serializer.ProjectMetadata):
            raise TypeError("metadata must be serializer.ProjectMetadata")
        self._metadata = value
        self._meta_dirty = True      

    @property
    def geo_data(self) -> serializer.ProjectGeoData:
        if self._geo_data is None:
            geo_tbl = serializer.ProjectGeoData()
            geo_tbl.parse(self.project_path)
            self._geo_data = geo_tbl
        return self._geo_data

    @geo_data.setter
    def geo_data(self, value: serializer.ProjectGeoData):
        if not isinstance(value, serializer.ProjectGeoData):
            raise TypeError("metadata must be serializer.ProjectGeodata")
        self._geo_data = value
        self._geo_dirty = True
    
# Controller for managing the overall projects
class project_manager:
    DEFAULT_CONFIG = {
        # Folder paths
        "destination_folder": "data",
        "source_folder": "src", 
        "in_folder": "IN",
        "CycleRAP_source": global_var.CYCLERAPVER,
        # Video config
        "capture_frequency": 10,  # GPS sampling rate in Hz
        # Name configurations
        "project_prefix": "",
        # Persistent states
        "current_project": None,
    }

    def __init__(self):
        # Path variables
        self.des_path : Path            = None
        self.src_path : Path            = None
        self.in_path  : Path            = None
        self.cycleRAP_model_src : Path  = None

        # Application-level variables
        self.shapefile                                                  = None
        self.capture_freq                                               = None

        # NOTE: Variable deprecated but still kept for backwards compatibility, 
        # Use the cycleRAP_interface class methods instead
        self.cyclerap_interface : cycleRAP_interface.cycleRAP_interface = cycleRAP_interface.cycleRAP_interface

        self._initialise()
    
    # Initialises all path and application-level variables
    def _initialise(self):
        # Create config if not existing
        if not get_config_path().exists():
            self.save_config(self.DEFAULT_CONFIG)

        with open(get_config_path(), 'r') as json_file:
            data = json.load(json_file)
        self.load_config(data)

        self._discover_projects()

    # TODO: DEPRECATED, NEEDS UPDATE
    def get_project_directory(self) -> Path:
        return self.des_path / self.project_name
    
    def get_data_directory(self) -> Path:
        return self.get_project_directory(self) / global_var.PROJECT_CYCLERAP_DIRECTORY

# ================================================================================================================
# UTILITY
# ================================================================================================================
    def _discover_projects(self):
        if self.des_path is None:
            raise ValueError("self.des_path is not set. Please initialise it before discovering projects.")

        # NOTE: we might want to change to a random access data structure for more efficient look-up
        self.projects : list[Project] = [
            Project(p) for p in self.des_path.iterdir() if p.is_dir()
        ]

    def delete_project(self, project_name: str):
        for proj in self.projects:
            if proj.metadata.project_name == project_name:
                proj._delete()
                self.projects.remove(proj)
                return True
            
        raise KeyError(f"Project not found: {project_name}")

    def list_names(self):
        return [p.project_path.name for p in self.projects]
    
    def project(self, project_name: str) -> Project:
        for proj in self.projects:
            if proj.metadata.project_name ==  project_name:
                return proj
        raise KeyError(f"Project not found: {project_name}")
    
    # TODO: DEPRECATED, NEEDS UPDATE
    def isValid(self):
        if self.project_name is not None: return True 
        else: return False
        
    def create_project(self, project_title, geo_data : gpd.geodataframe, dataset_name):
        proj_root = self.des_path / project_title

        prefix = str(project_title) + "_"
        rename_files_with_prefix(proj_root / global_var.PROJECT_IMAGES_FOLDER, prefix)

        # Get image reference
        image_ref = load_images_from_folder_cv(proj_root / global_var.PROJECT_IMAGES_FOLDER)
        size = len(image_ref)

        # Craft project metadata
        now = datetime.datetime.now().date()
        project_metadata = serializer.ProjectMetadata()
        project_metadata.project_name   = project_title
        project_metadata.date_created   = now
        project_metadata.last_updated   = now
        project_metadata.created_by     = "default"
        project_metadata.dataset        = dataset_name
        project_metadata.progress       = []
        project_metadata.size           = size
        project_metadata.tags           = []

        # Craft geo data csv
        geo_tbl = serializer.ProjectGeoData(size)
        geo_tbl.loc[:, serializer.ProjectGeoData.Fields.IMAGE_REFERENCE_STR] = image_ref[:size]
        geo_tbl.populate_linestring(geo_data)

        # Craft version 1 snapshot metadata
        snapshot_dataframe = serializer.SnapshotMetadata(size)

        # Craft default attributes 
        attribute_dataframe = serializer.Attributes(size, self.cyclerap_interface.attribute_default_values)

        ########################## Set speed limit attribute ##########################
        
        #-------------------------- Parameter Configuration --------------------------#
        MAX_DISTANCE = 30.0   # Maximum Search distance (meters)
        
        #------------------------------ Data Preparation ------------------------------#
        # Load Speed limit shapefile and convert CRS to SVY21
        speed_gdf = gpd.read_file("shp/Speed_limit/ROADATTRIBUTELINE_SPEEDLIMITS.shp").to_crs(epsg=3414)
        spatial_index_speed = speed_gdf.sindex
        
        # Load Road Operating Speed shapefile, csv file and convert CRS to SVY21
        ros_gdf = gpd.read_file("shp/LinkID_Shape_File/31Oct24_Link_FUL.shp").to_crs(epsg=3414)
        spatial_index_ros = ros_gdf.sindex
        
        ros_csv = pd.read_csv("shp/LinkID_Shape_File/TSE_AdHocReq_ERP2AverageSpeedData_250425.csv", header=None)
        ros_csv.columns = ros_csv.iloc[0]
        ros_csv = ros_csv.drop(index=0).reset_index(drop=True)
        ros_csv["LINKID"] = ros_csv["LINKID"].astype(str)
        ros_csv.set_index("LINKID", inplace=True)


        #------------------------------ Data Processing ------------------------------#
        # Loop through every image
        for idx, row in geo_tbl.df.iterrows():
            
            first_point = Point(row['LineString'].coords[0])
            buffer_bounds = first_point.buffer(20.0).bounds
            
            # Set Speed Limit ========================================================
            # Query possible nearby speed limit lines
            candidate_idx_speed = list(spatial_index_speed.intersection(buffer_bounds))
            candidates_speed = speed_gdf.iloc[candidate_idx_speed].copy()

            if not candidates_speed.empty:
                # Find nearest speed limit segment
                candidates_speed['dist_to_pt'] = candidates_speed.geometry.distance(first_point)
                nearest_row = candidates_speed.loc[candidates_speed['dist_to_pt'].idxmin()]
                
                if nearest_row['dist_to_pt'] <= MAX_DISTANCE:
                    attribute_dataframe.loc[idx, 'Road speed limit'] = nearest_row['SPEEDLIMIT']
                    
            else:
                #TODO: No nearby speed limit found
                pass
            
            # Set Road Operating Speed ================================================
            candidates_idx_ros = list(spatial_index_ros.intersection(buffer_bounds))
            candidate_ros = ros_gdf.iloc[candidates_idx_ros].copy()
            candidate_ros["distance"] = candidate_ros.geometry.distance(first_point)
            nearby_roads_ros = candidate_ros[candidate_ros["distance"] <= MAX_DISTANCE]
            
            if not nearby_roads_ros.empty:
                
                # Nearest road
                nearby_roads_ros = nearby_roads_ros.loc[nearby_roads_ros["distance"].idxmin()]
                link_id = str(nearby_roads_ros["LK_ID_NUM"])
                if link_id in ros_csv.index:
                    result = ros_csv.loc[link_id]
                    attribute_dataframe.loc[idx, 'Road operating speed (mean)'] = result["AVERAGE_HOURLY_SPEED"]
                else:
                    #TODO: Set as defult Road Operating Speed
                    pass
            #TODO: AADT
        
        
        ####################################################################################
        
        # Create project
        new_project = Project(proj_root)
        new_project.create_new_version()

        # Initialise project var
        new_project.geo_data = geo_tbl
        new_project.metadata = project_metadata
        new_project.latest().attributes = attribute_dataframe
        new_project.latest().snapshot_metadata = snapshot_dataframe
        # Treatment and Results should remain empty
        new_project.latest().results = serializer.Results()
        new_project.latest().treatment = serializer.Treatment()

        # Write project to file
        new_project.save_all()

        self.projects.append(new_project)
        
    # NOTE: DEPRECATED
    def get_latest_file_before(project_path: Path, cutoff_date: datetime) -> str:
        all_files = list(project_path.glob("*.json"))
        valid_files = []

        for file in all_files:
            date_str = file.stem
            try:
                file_date = datetime.strptime(date_str, "%Y%m%d")
                if file_date <= cutoff_date:
                    valid_files.append((file_date, file))
            except ValueError:
                continue  # Skip invalid files

        if not valid_files:
            return None

        latest_file = max(valid_files, key=lambda x: x[0])[1]
        return latest_file
    
    # Search the entire project repository and create a temporary project based on the filter
    def create_temporary_project(self, filter_input : serializer.ProjectMetadata) -> Project:
        return self.merge_project_list(self.search(filter_input))

    def merge_project(self, lhs_name : str, rhs_name : str) -> Project:
        return self.project(lhs_name) + self.project(rhs_name)
    
    def merge_project_list(self, project_list : list[str] | list[Project]) -> Project:
        if all(isinstance(p, str) for p in project_list):
            project_list = [self.project(name) for name in project_list]
        
        merged = Project()

        # Change metadata
        merged.metadata.project_name = "Merged"

        # Merge geo data
        geo_dfs = [p.geo_data.df for p in project_list]
        merged._geo_data.df = pd.concat(geo_dfs, ignore_index=True)

        # Merge versions
        attr_dfs = [p.latest().attributes.df for p in project_list]
        merged.latest()._attributes._df = pd.concat(attr_dfs, ignore_index=True)

        result_dfs = [p.latest().results.df for p in project_list]
        merged.latest()._results._df = pd.concat(result_dfs, ignore_index=True)

        treatment_dfs = [p.latest().treatment.df for p in project_list]
        merged.latest()._treatment._df = pd.concat(treatment_dfs, ignore_index=True)
        
        snapshot_dfs = [p.latest().snapshot_metadata.df for p in project_list]
        merged.latest()._snapshot_metadata._df = pd.concat(snapshot_dfs, ignore_index=True)

        return merged


    # Search the project with the filter criteria
    def search(self, filter_input : serializer.ProjectMetadata = None, filter_attributes: dict = None, filter_treatment: dict = None, filter_results: dict = None) -> list[Project]:
        found : list[Project] = []

        for project in self.projects:
            meta = project.metadata
            match = True

            # Match progress (meta.progress <= filter_input.progress)
            # if ( meta.progress / meta.size * 100 ) > filter_input.progress:
            #     match = False
            #     continue

            # Match project_name (case-insensitive substring match to any name in the list)
            if filter_input.project_name:
                if not meta.project_name:
                    match = False
                    continue
                else:
                    # Ensure filter_input.project_name is a list
                    filter_names = filter_input.project_name if isinstance(filter_input.project_name, list) else [filter_input.project_name]
                    if not any(name.lower() in meta.project_name.lower() for name in filter_names):
                        match = False
                        continue

            # Match created_by (exact)
            if filter_input.created_by:
                if filter_input.created_by != meta.created_by:
                    match = False
                    continue

            # Match dataset (exact)
            if filter_input.dataset:
                if filter_input.dataset != meta.dataset:
                    match = False
                    continue

            # Match size (meta.size <= filter_input.size)
            if filter_input.size is not None:
                if meta.size is None or meta.size > filter_input.size:
                    match = False
                    continue

            # Match date_created <= filter_input.date_created
            if filter_input.date_created:
                if not meta.date_created or meta.date_created > filter_input.date_created:
                    match = False
                    continue

            # Match last_updated <= filter_input.last_updated
            if filter_input.last_updated:
                if not meta.last_updated or meta.last_updated > filter_input.last_updated:
                    match = False
                    continue

            # Match tags (all filter_input tags must be present in meta.tags)
            if filter_input.tags:
                # Normalize to list of lowercase tags (strip whitespace)
                if isinstance(filter_input.tags, str):
                    filter_tags = [t.strip().lower() for t in filter_input.tags.split(",") if t.strip()]
                elif isinstance(filter_input.tags, list):
                    filter_tags = [t.lower() for t in filter_input.tags if isinstance(t, str)]
                else:
                    filter_tags = []

                # Normalize meta tags too
                meta_tags = [t.lower() for t in (meta.tags or [])]

                # All filter tags must be present in meta tags
                if not all(tag in meta_tags for tag in filter_tags):
                    match = False
                    continue

            if match:
                found.append(project)

        return found

    
# ================================================================================================================
# SERIALIZATION
# ================================================================================================================

    def load_config(self, config):
        # Set paths from config
        self.des_path   = Path(get_full_path(config.get("destination_folder")))
        self.src_path   = Path(get_full_path(config.get("source_folder")))
        self.in_path    = Path(get_full_path(config.get("in_folder")))
        self.capture_freq       = config.get("capture_frequency")
        self.cycleRAP_model_src = config.get("CycleRAP_source")
        self.project_name       = config.get("current_project")

        return config

    def save_config(self, config):
        with open(get_config_path(), "w") as json_file:
            json.dump(config, json_file, indent=4)

    def write_config(self, key, value):
        with open(get_config_path(), "r") as json_file:
            data = json.load(json_file)
        data[key] = value
        self.save_config(data)

    # TODO (ONCE ACTIVE VERSION CONTROL HAS BEEN IMPLEMENTED): Project has to be opened to save
    def save_project(self, project_name: str = None) -> bool:
        pass

    # TODO (ONCE ACTIVE VERSION CONTROL HAS BEEN IMPLEMENTED): Loads all project-level variables from project directory
    def read_project(self, project_name: Path, best_before = None):
        self.project.project_path = self.des_path / project_name

        if best_before is not None:
            self.project.open_best_before(best_before)
        else:
            self.project.open_latest()
        pass


# ================================================================================================================
# LOCAL
# ================================================================================================================

def load_images_from_folder_cv(folder):
    image_array = []
    
    for filename in os.listdir(folder):
        if filename.lower().endswith(".jpg"):
            image_array.append(filename)
    
    def extract_numeric_key(filename):
        # Search for "Cam" in the filename
        cam_match = re.search(r"Cam\d+", filename)
        
        if cam_match:
            # Extract from the Cam part onwards
            cam_section = filename[cam_match.start():]
            nums = re.findall(r'\d+', cam_section)
            if len(nums) >= 2:
                # Skip the camera number, use the remaining numeric parts
                key_str = "".join(nums[1:])
            else:
                key_str = "".join(nums)
        else:
            # No "Cam" found, fallback to all digits in full filename
            nums = re.findall(r'\d+', filename)
            key_str = "".join(nums) if nums else "0"
        
        return int(key_str)
    
    return sorted(image_array, key=extract_numeric_key)

def get_config_path():
    return Path(get_full_path("config.json"))

def rename_files_with_prefix(directory: str, prefix: str):
    """
    Rename all files in the given directory by adding a prefix to their filenames.

    Parameters:
        directory (str): Path to the target directory.
        prefix (str): Prefix to add to each file name.
    """
    dir_path = Path(directory)

    if not dir_path.is_dir():
        raise ValueError(f"The path '{directory}' is not a valid directory.")

    for file in dir_path.iterdir():
        if file.is_file():
            new_name = prefix + file.name
            new_path = file.with_name(new_name)
            file.rename(new_path)
            print(f"Renamed: {file.name} -> {new_name}")