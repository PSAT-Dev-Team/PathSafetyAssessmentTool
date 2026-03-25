from . import serializer
import numpy as np
from PIL import Image
from pathlib import Path

class CycleRAP_Coding_Helper:
    path_segmentation_model : None = None
    road_classification_model: None = None #CY
    off_road_bicycle_classifier : None = None
    adj_road_lanes_classifier : None = None
    fixed_obstacle_classifier: None = None 
    Development_access_classifier: None = None 
    delineation_classifier: None = None 

    DEV_ACCESS_CONDITIONS = [
        {5, 2, 1, 0},           # Textile, Buffer Zone, Road, Path
        {5, 2, 1, 0, 4},        # Textile, Buffer Zone, Road, Path, Zebra
        {1, 0, 2, 4},           # Road, Path, Buffer Zone, Zebra
        {5, 1, 4}               # Textile, Road, Zebra
    ]


    FIXED_OBSTACLE_RELEVANT_LABELS = {1, 2, 4, 6, 7}  #CY

    FIXED_OBSTACLE_BUS_RELEVANT_LABELS = {1, 4}
    
    FIXED_OBSTACLE_DELINEATION_RELEVANT_LABELS = {1 , 2} #CY

    DELINEATION_RELEVANT_LABELS = {0, 1, 2, 5}



    def __init__(self):
        raise RuntimeError("Do not create class instance, use the class methods instead")

    # Load in CV models
    @classmethod
    def initialise(cls, model_dir: Path):
        from ultralytics import YOLO
        from ultralytics.nn import tasks as _ul_tasks

        # Patch BaseModel.fuse() at the class level so Ultralytics >=8.x doesn't
        # crash on older .pt files that have already-fused Conv layers (no 'bn').
        _orig_fuse = _ul_tasks.BaseModel.fuse
        def _safe_fuse(self, verbose=True):
            try:
                return _orig_fuse(self, verbose=verbose)
            except AttributeError:
                return self
        _ul_tasks.BaseModel.fuse = _safe_fuse

        def _load(path: Path) -> "YOLO":
            return YOLO(path)

        # === Load Path Segmentation Model ===
        seg_path = model_dir / "path_seg.pt"
        if seg_path.exists():
            cls.path_segmentation_model = _load(seg_path)
        else:
            raise RuntimeError(f"\"{seg_path}\" Could not be loaded")
        
        # === Load Off-Road Bicycle Classifier ===
        off_road_path  = model_dir / "off_road_bicycle_path.pt"
        if off_road_path.exists():
            cls.off_road_bicycle_classifier = _load(off_road_path)
        else:
            raise RuntimeError(f"\"{off_road_path}\" Could not be loaded")
        
        # === Load Adjacent Road Lanes Classifier ===
        adj_road_path  = model_dir / "adj_road_lane.pt"
        if adj_road_path.exists():
            cls.adj_road_lanes_classifier = _load(adj_road_path)
        else:
            raise RuntimeError(f"\"{adj_road_path}\" Could not be loaded")

        # === Load fixed obstacle lane Classifier ===
        fixed_obstacle_path = model_dir / "LTA_FIXEDOBSTACLE_BEST_2.pt" #cy
        if fixed_obstacle_path.exists():
            cls.fixed_obstacle_classifier = _load(fixed_obstacle_path)
        else:
            raise RuntimeError(f"\"{fixed_obstacle_path}\"Could not be loaded")
        
        # === Load  dev access Classifier ===
        Development_Access_path = model_dir / "DevelopmentAccess_last_150epochs.pt" #cy
        if Development_Access_path.exists():
            cls.Development_access_classfier = _load(Development_Access_path)
        else:
            raise RuntimeError(f"\"{Development_Access_path}\"Could not be loaded")

        Delineation_path = model_dir / "LTA_Dill_4_Best.pt" #cy
        if Delineation_path.exists():
            cls.Delineation_classfier = _load(Delineation_path)
        else:
            raise RuntimeError(f"\"{Delineation_path}\"Could not be loaded")
        

        Road_class_path = model_dir / "RoadClassification_best.pt"
        if Road_class_path.exists():
            cls.road_classification_model = _load(Road_class_path)
        else:
            raise RuntimeError(f"\"{Road_class_path}\" Could not be loaded")

    # Facility Type
    # Adj road Lane (0-1, 1-3)
    # Crossing Facility
    # Intersection or Road Crossing
    # Delineation
    # Peak pedestrian flow across facility (only low)
    # NoL Intersecting Road (Traffic Crossing)
    # Adj obj/level change (0-1, 1-3)
    # Adj Sidewalk (0-1)
    # Light Segregation
    # ====

    @classmethod
    def autocode(cls, image_path: Path) -> dict:
        if not cls.path_segmentation_model:
            raise RuntimeError("Path segmentation model is not initialised.")
        
        SEGMENTATION_CONFIDENCE_THRESHOLD = 0.5
        ADJ_RD_CONF_THRESHOLD = 0.8
        OFF_RD_CONF_THRESHOLD = 0.8
        FIXED_OBSTACLE_CONFIDENCE_THRESHOLD= 0.6
        DEV_ACCESS_CONFIDENCE_THRESHOLD = 0.5
        DELINEATION_CONFIDENCE_THRESHOLD = 0.5
        
        
        attribute_fields = dict.fromkeys(serializer.Attributes.Fields.values(), None)

        seg_results = cls.path_segmentation_model.predict(image_path)
        result = cls._filter_segmentation_results(seg_results[0], SEGMENTATION_CONFIDENCE_THRESHOLD)

        cls_ids = result.boxes.cls.int().tolist() if result.boxes else []
        masks_present = result.masks is not None

        if not masks_present or 0 not in cls_ids:
            print("No path detected in the image. Manual review required.")
        else:
            # === Handle path-based logic (Default is Multi-Use Path) ===
            #attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Multi-Use Path"] #CY
            #attribute_fields[serializer.Attributes.Fields.DELINEATION_STR] = serializer.presence_mapping["Not Present"] #CY
            attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Present"]

            image = Image.open(image_path).convert("RGB")
            path_indices = [i for i, cls_id in enumerate(cls_ids) if cls_id == 0]

            # === If road is not present (class 1) ===
            if 1 not in cls_ids:
                attribute_fields[serializer.Attributes.Fields.ADJ_ROAD_LANE_01M_STR] = serializer.presence_mapping["Not Present"]
                attribute_fields[serializer.Attributes.Fields.ADJ_ROAD_LANE_13M_STR] = serializer.presence_mapping["Not Present"]

            # Iterate through all detected path segments
            for i in path_indices:
                box = result.boxes.xyxy[i].cpu().numpy().astype(int)
                x1, y1, x2, y2 = box
                cropped = np.array(image.crop((x1, y1, x2, y2)))[..., ::-1]  # RGB → BGR


                # === Adjacent road lanes classification ===
                if 1 in cls_ids: # Trigger for if road is detected
                    adj_result = cls.adj_road_lanes_classifier.predict(cropped)[0]
                    pred_adj_class = int(adj_result.probs.top1)
                    adj_conf_score = float(adj_result.probs.top1conf)

                    if adj_conf_score < ADJ_RD_CONF_THRESHOLD: pred_adj_class = 0

                    match(pred_adj_class):
                        case 0: 
                            # This case would mean that either the confidence score is too low 
                            # or the classifier predicts no road even though the segmentation detects a road
                            print("Adjacent road lane classifier uncertain — manual review recommended.")
                        case 1:
                            attribute_fields[serializer.Attributes.Fields.ADJ_ROAD_LANE_01M_STR] = serializer.presence_mapping["Present"]
                            attribute_fields[serializer.Attributes.Fields.ADJ_ROAD_LANE_13M_STR] = serializer.presence_mapping["Not Present"]

                            attribute_fields[serializer.Attributes.Fields.ADJ_OBJ_LVL_CHGE_01M_STR] = serializer.presence_mapping["Present"]
                            attribute_fields[serializer.Attributes.Fields.ADJ_OBJ_LVL_CHGE_13M_STR] = serializer.presence_mapping["Not Present"]
                        case 2:
                            attribute_fields[serializer.Attributes.Fields.ADJ_ROAD_LANE_01M_STR] = serializer.presence_mapping["Not Present"]
                            attribute_fields[serializer.Attributes.Fields.ADJ_ROAD_LANE_13M_STR] = serializer.presence_mapping["Present"]

                            attribute_fields[serializer.Attributes.Fields.ADJ_OBJ_LVL_CHGE_01M_STR] = serializer.presence_mapping["Not Present"]
                            attribute_fields[serializer.Attributes.Fields.ADJ_OBJ_LVL_CHGE_13M_STR] = serializer.presence_mapping["Present"]
                
                # === Off-road bicycle classification ===
                cls_result = cls.off_road_bicycle_classifier.predict(cropped)[0]
                pred_class = int(cls_result.probs.top1)
                off_rd_conf_score = float(cls_result.probs.top1conf)

                if pred_class == 0 and off_rd_conf_score >= OFF_RD_CONF_THRESHOLD:
                    attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Off-Road Bicycle Path"]
                    attribute_fields[serializer.Attributes.Fields.DELINEATION_STR] = serializer.presence_mapping["Present"]

                    if len(path_indices) > 1:
                        attribute_fields[serializer.Attributes.Fields.ADJ_SIDEWALK_01M_STR] = serializer.presence_mapping["Present"]
                    break
        

        if masks_present and cls.fixed_obstacle_classifier:
            fixed_results = cls.fixed_obstacle_classifier.predict(image_path)[0]
            fixed_result = cls._filter_segmentation_results(
            fixed_results, FIXED_OBSTACLE_CONFIDENCE_THRESHOLD
        )

        if fixed_result.masks is not None:
            seg_mask_data = fixed_result.masks.data.cpu().numpy()  # (N, H, W)
            seg_cls_ids = fixed_result.boxes.cls.int().tolist()
            h, w = seg_mask_data.shape[1:]
            seg_map = np.zeros((h, w), dtype=np.int32)

            # Build segmentation map from classifier results
            for mask, cid in zip(seg_mask_data, seg_cls_ids):
                seg_map[mask > 0.5] = cid

        # Area calculations
        pathway_area = np.sum(seg_map == 0)   # pathway label = 0
        road_area = np.sum(seg_map == 8)      # road label = 8

        # Split road into left vs right halves
        left_road_area = np.sum(seg_map[:, :w//2] == 8)
        right_road_area = np.sum(seg_map[:, w//2:] == 8)


        # --- New: Bottom edge check for pathway ---
        bottom_row = seg_map[-1, :]  # last row of pixels
        bottom_pathway_ratio = np.sum(bottom_row == 0) / w


        # --- New: Bottom half check for pathway ---
        bottom_half = seg_map[h//2:, :]  # bottom half of the image
        bottom_half_area = bottom_half.size
        bottom_half_pathway_area = np.sum(bottom_half == 0)
        bottom_half_pathway_ratio = bottom_half_pathway_area / bottom_half_area

        
    

        # Debug prints
        print(f"Pathway area: {pathway_area}")
        print(f"Road area: {road_area}")
        print(f"Left road area: {left_road_area}")
        print(f"Right road area: {right_road_area}")
        print(f"Bottom pathway ratio: {bottom_pathway_ratio:.2f}")

        # --- Decision Rule ---

        if any(c in [1, 4] for c in seg_cls_ids):
            print("Bus Fixed obstacle detected — possibly sidewalk.")
            attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Sidewalk"]
            attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Present"]
            attribute_fields[serializer.Attributes.Fields.FIXED_OBSTACLE_STR] = serializer.presence_mapping["Present"]
        
        elif bottom_half_pathway_ratio > 0.90 and pathway_area > road_area:
            print("Decision: pathway takes up more than 50% of bottom image")
            attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Multi-Use Path"]
            attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Present"]

        #elif pathway_area > road_area:
        #    print("Decision: pathway larger than Road")
        #    attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Sidewalk"]
        else:
            # If road is mostly confined to one side (≥80% in left or right half), call it sidewalk
            if (left_road_area / (road_area + 1e-6) > 0.8) or (right_road_area / (road_area + 1e-6) > 0.8):
                print("Decision: road is mostly confined to one side")
                attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Sidewalk"]
                attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Present"]
            elif bottom_pathway_ratio > 0.55 and road_area == 0:
                print("Decision: only pathway detected")
                attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Sidewalk"]
                attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Present"]
            else:
                attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Mixed Traffic Road Lane"]
                attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Not Present"]



                # === Fixed Obstacle Detection with pathway–obstacle intersection logic ===
        if cls.fixed_obstacle_classifier and masks_present:
            fixed_results = cls.fixed_obstacle_classifier.predict(image_path)
            fixed_result = cls._filter_segmentation_results(
                fixed_results[0], FIXED_OBSTACLE_CONFIDENCE_THRESHOLD
            )

            detected_cls_ids = fixed_result.boxes.cls.int().tolist() if fixed_result.boxes else []
            obstacle_masks = fixed_result.masks.data.cpu().numpy() if fixed_result.masks is not None else []

            # Get only delineation masks with labels {1,2}
            path_masks = []
            if result.masks is not None:
                path_masks = [
                    mask for i, (mask, cid) in enumerate(zip(result.masks.data.cpu().numpy(), cls_ids))
                    if cid in cls.FIXED_OBSTACLE_DELINEATION_RELEVANT_LABELS
                ]

            obstacle_pathway_intersections = 0
            non_fixed_obstacle_intersections = 0
            

            if len(path_masks) > 0 and len(obstacle_masks) > 0:
                combined_path = np.any(path_masks, axis=0)

                for obs_mask, cid in zip(obstacle_masks, detected_cls_ids):
                    if cid in cls.FIXED_OBSTACLE_RELEVANT_LABELS:
                        if np.any(np.logical_and(combined_path, obs_mask)):
                            obstacle_pathway_intersections += 1
                            
                    # === Non-Fixed Obstacle (label 9) detection ===
                    if cid == 9:  # check specifically for label 9
                        if np.any(np.logical_and(combined_path, obs_mask)):
                            non_fixed_obstacle_intersections += 1   

            # Check if delineation was marked as present from earlier
            delineation_present = (
                attribute_fields[serializer.Attributes.Fields.DELINEATION_STR]
                == serializer.presence_mapping["Present"]
            )

            # Apply logic:
            if delineation_present:
                if obstacle_pathway_intersections > 2:
                    print("fixed obstacle have intersection - have dillineation")
                    attribute_fields[serializer.Attributes.Fields.FIXED_OBSTACLE_STR] = serializer.presence_mapping["Present"]
                    attribute_fields[serializer.Attributes.Fields.WIDTH_RESTRICTION_STR] = serializer.presence_mapping["Present"]
                else:
                    print("fixed obstacle have intersection - have dillineation, but not twice")
                    attribute_fields[serializer.Attributes.Fields.FIXED_OBSTACLE_STR] = serializer.presence_mapping["Not Present"]
            else:
                if obstacle_pathway_intersections > 0:
                    print("fixed obstacle have intersection - no dillineation")
                    attribute_fields[serializer.Attributes.Fields.FIXED_OBSTACLE_STR] = serializer.presence_mapping["Present"]
                    attribute_fields[serializer.Attributes.Fields.WIDTH_RESTRICTION_STR] = serializer.presence_mapping["Present"]
                else:
                    print("fixed obstacle no intersection - no dillineation")
                    attribute_fields[serializer.Attributes.Fields.FIXED_OBSTACLE_STR] = serializer.presence_mapping["Not Present"]
           

            if non_fixed_obstacle_intersections > 0:
                print("non fixed obstacle (label 9) intersects with pathway")
                attribute_fields[serializer.Attributes.Fields.NON_FIXED_OBSTACLE_STR] = serializer.presence_mapping["Present"]
                attribute_fields[serializer.Attributes.Fields.WIDTH_RESTRICTION_STR] = serializer.presence_mapping["Present"]
            else:
                attribute_fields[serializer.Attributes.Fields.NON_FIXED_OBSTACLE_STR] = serializer.presence_mapping["Not Present"]

            if any(c in [1, 4] for c in detected_cls_ids):
                print("Bus Fixed obstacle detected — possibly sidewalk.")
                attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Sidewalk"]
                attribute_fields[serializer.Attributes.Fields.FIXED_OBSTACLE_STR] = serializer.presence_mapping["Present"]
                attribute_fields[serializer.Attributes.Fields.WIDTH_RESTRICTION_STR] = serializer.presence_mapping["Present"]
                attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Present"]


        # === Delineation Detection ===
        if cls.Delineation_classfier:
            delineation_results = cls.Delineation_classfier.predict(image_path)
            delineation_result = delineation_results[0]
            delineation_result = cls._filter_segmentation_results(delineation_result, DELINEATION_CONFIDENCE_THRESHOLD)

            detected_cls_ids = delineation_result.boxes.cls.int().tolist() if delineation_result.boxes else []
    
            print("Delineation Detected labels:", detected_cls_ids)

            
            if any(cls_id in cls.DELINEATION_RELEVANT_LABELS for cls_id in detected_cls_ids):
                print("dillll present")
                attribute_fields[serializer.Attributes.Fields.DELINEATION_STR] = serializer.presence_mapping["Present"]
                attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Multi-Use Path"]
                attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Present"]

            
            else:
                attribute_fields[serializer.Attributes.Fields.DELINEATION_STR] = serializer.presence_mapping["Not Present"]



                # === Run Road Classification Model === #CY
        if cls.road_classification_model:
            road_results = cls.road_classification_model.predict(image_path)[0]
            pred_class = int(road_results.probs.top1)
            pred_conf = float(road_results.probs.top1conf)

            print(f"Road Classification Prediction: {pred_class} (conf {pred_conf:.2f})")

            # --- CASE 0: Dev Access ---

            if pred_class == 0:
                dev_results = cls.Development_access_classfier.predict(image_path)[0]
                dev_result = cls._filter_segmentation_results(dev_results, 0.5)
                dev_cls_ids = set(dev_result.boxes.cls.int().tolist()) if dev_result.boxes else set()

                # check if traffic crossing present (label 3)
                if 3 in dev_cls_ids or 4 in cls_ids:
                    attribute_fields[serializer.Attributes.Fields.PROP_ACCESS_STR] = serializer.presence_mapping["Not Present"]
    
                else:
                    attribute_fields[serializer.Attributes.Fields.PROP_ACCESS_STR] = serializer.presence_mapping["Not Present"]

            # --- CASE 1: Off-Road Bicycle ---
            elif pred_class == 1:
                delineation_results = cls.Delineation_classfier.predict(image_path)[0]
                delineation_result = cls._filter_segmentation_results(delineation_results, 0.5)
                dill_cls_ids = set(delineation_result.boxes.cls.int().tolist()) if delineation_result.boxes else set()

                # Check for Red Path (label 5)
                if 5 in dill_cls_ids:
                    attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Off-Road Bicycle Path"]
                    attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Present"]
                
                
                else:
                    # No red path = not considered off-road bicycle
                    pass
                    


            # --- CASE 2 or 3: Skip and continue rest of code ---
            else:
                pass


        # === Traffic / Zebra Crossing Detection (class 3 = traffic, 4 = zebra) ===
        #has_traffic = 3 in cls_ids
        #has_zebra = 4 in cls_ids

        # === Traffic / Zebra Crossing Detection (class 3 = traffic, 4 = zebra) ===
        confidences = result.boxes.conf.tolist() if result.boxes else []
        class_ids   = result.boxes.cls.int().tolist() if result.boxes else []

        traffic_conf = [conf for cid, conf in zip(class_ids, confidences) if cid == 3]
        zebra_conf   = [conf for cid, conf in zip(class_ids, confidences) if cid == 4]

        has_traffic = any(conf > 0.6 for conf in traffic_conf)
        has_zebra   = any(conf > 0.6 for conf in zebra_conf)

        
        

        if has_traffic or has_zebra:
            print("traffic or zebra detected")
            attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] = serializer.facility_type_mapping["Mixed Traffic Road Lane"]
            attribute_fields[serializer.Attributes.Fields.CROSS_FACILITY_STR] = serializer.presence_mapping["Present"]
            attribute_fields[serializer.Attributes.Fields.DELINEATION_STR] = serializer.presence_mapping["Present"]
            attribute_fields[serializer.Attributes.Fields.PEAK_PED_FLOW_STR] = serializer.none_low_modhigh_mapping["Low"]
            attribute_fields[serializer.Attributes.Fields.INTERSECT_ROAD_CROSS_STR] = serializer.presence_mapping["Present"]
            attribute_fields[serializer.Attributes.Fields.LIGHT_SEGREGATION_STR] = serializer.presence_mapping["Not Present"]
            attribute_fields[serializer.Attributes.Fields.PROP_ACCESS_STR] = serializer.presence_mapping["Not Present"]

            if has_traffic:
                print("traffic detected")
                attribute_fields[serializer.Attributes.Fields.ADJ_ROAD_LANE_01M_STR] = serializer.presence_mapping["Present"]
                attribute_fields[serializer.Attributes.Fields.NOL_INTERSECT_ROAD_STR] = serializer.NoL_mapping["> 1 per Direction"]
            elif has_zebra:
                print("zebra detected")
                attribute_fields[serializer.Attributes.Fields.ADJ_ROAD_LANE_13M_STR] = serializer.presence_mapping["Present"]
                attribute_fields[serializer.Attributes.Fields.PROP_ACCESS_STR] = serializer.presence_mapping["Not Present"]
            
            #if attribute_fields[serializer.Attributes.Fields.FACILITY_TYPE_STR] == serializer.facility_type_mapping["Mixed Traffic Road Lane"]:
                #attribute_fields[serializer.Attributes.Fields.DELINEATION_STR] = serializer.presence_mapping["Not Present"]
        

        # ==            = Development Access Detection ===
        if cls.Development_access_classfier:
            dev_results = cls.Development_access_classfier.predict(image_path)
            dev_result = dev_results[0]
            dev_result = cls._filter_segmentation_results(dev_result, DEV_ACCESS_CONFIDENCE_THRESHOLD)

            dev_cls_ids = set(dev_result.boxes.cls.int().tolist()) if dev_result.boxes else set()
            print("Detected labels:", dev_result.boxes.cls.int().tolist() if dev_result.boxes else [])
            
        for valid_set in cls.DEV_ACCESS_CONDITIONS:
            if valid_set.issubset(dev_cls_ids):
                if (3 not in dev_cls_ids or 4 not in cls_ids):
                    attribute_fields[serializer.Attributes.Fields.PROP_ACCESS_STR] = serializer.presence_mapping["Present"]
                    attribute_fields[serializer.Attributes.Fields.INTERSECT_ROAD_CROSS_STR] = serializer.presence_mapping["Present"]
                    print("Detected labels:", dev_result.boxes.cls.int().tolist() if dev_result.boxes else [])
                    break
       
        else:
             attribute_fields[serializer.Attributes.Fields.PROP_ACCESS_STR] = serializer.presence_mapping["Not Present"]



        return attribute_fields
    
    # Utility Methods
    # =================================
    @staticmethod
    def _filter_segmentation_results(result, conf_thresh):
        mask = result.boxes.conf > conf_thresh
        result.boxes = result.boxes[mask]
        if result.masks is not None:
            result.masks.data = result.masks.data[mask]
        return result

    def _pred_facility_type():
        pass

    # 0: Not present
    # 1: 0-1
    # 2: 1-3
    @classmethod
    def _pred_adj_road_lane(cls):
        pass