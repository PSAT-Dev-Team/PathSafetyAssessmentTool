import io
import datetime
from flask import Blueprint, request, send_file, jsonify
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.chart.data import ChartData, CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
import traceback

from . import bp

@bp.route('/generate-pptx', methods=['POST'])
def generate_pptx():
    try:
        data = request.json
        selected_projects = data.get("selectedProjects", [])
        report_config = data.get("reportConfig", {})
        
        prs = Presentation()
        blank_layout = prs.slide_layouts[5] # Title only
        slide = prs.slides.add_slide(blank_layout)
        
        # Clear the default title placeholder
        for shape in slide.placeholders:
            if shape.is_placeholder:
                shape.text = ""
        
        # --- TITLE SECTION ---
        if report_config.get('showTitle', True):
            if report_config.get('showTitleText', True):
                txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(1))
                tf = txBox.text_frame
                tf.text = "Path Analysis Executive Summary"
                tf.paragraphs[0].font.bold = True
                tf.paragraphs[0].font.size = Pt(28)
                
            if report_config.get('showTitleDescription', True):
                txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.8), Inches(9), Inches(0.5))
                tf = txBox.text_frame
                tf.text = f"Analyzed Projects: {', '.join(selected_projects) if selected_projects else 'None'}"
                tf.paragraphs[0].font.size = Pt(14)
                tf.paragraphs[0].font.color.rgb = RGBColor(128, 128, 128)

        # --- MAP SECTION ---
        if report_config.get('showMap', True):
            if report_config.get('showMapView', True):
                shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.5), Inches(1.5), Inches(4.5), Inches(2.8))
                shape.text = "[ Map Route Visualization Placeholder ]\n" + \
                             "In a full production version, an automated GIS screenshot\n" + \
                             "or static map image would be inserted here."
                shape.fill.solid()
                shape.fill.fore_color.rgb = RGBColor(240, 240, 240)
                shape.text_frame.paragraphs[0].font.color.rgb = RGBColor(100, 100, 100)
                shape.text_frame.paragraphs[0].font.size = Pt(12)

        # --- DISTRIBUTION CHARTS ---
        if report_config.get('showCharts', True):
            if report_config.get('showPieChart', True):
                shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(5.2), Inches(1.5), Inches(2.1), Inches(2.8))
                shape.text = "[ Pie Chart Placeholder ]"
                shape.fill.solid()
                shape.fill.fore_color.rgb = RGBColor(240, 240, 240)
            if report_config.get('showBarChart', True):
                shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(7.5), Inches(1.5), Inches(2.1), Inches(2.8))
                shape.text = "[ Bar Chart Placeholder ]"
                shape.fill.solid()
                shape.fill.fore_color.rgb = RGBColor(240, 240, 240)

        # --- RISK BANDS SECTION ---
        if report_config.get('showRiskBands', True):
            # We'll use dummy chart data as generating precise pie charts 
            # requires fetching the exact score distributions in a real system.
            y_offset = Inches(4.7)
            
            if report_config.get('showRiskBandsOverall', True):
                txBox = slide.shapes.add_textbox(Inches(0.5), y_offset, Inches(3), Inches(0.5))
                tf = txBox.text_frame
                tf.text = "Overall Risk Level"
                tf.paragraphs[0].font.bold = True
                
                chart_data = ChartData()
                chart_data.categories = ['Low', 'Med', 'High', 'Extreme']
                chart_data.add_series('Risk', (40, 30, 20, 10))
                chart = slide.shapes.add_chart(XL_CHART_TYPE.PIE, Inches(0.5), y_offset + Inches(0.4), Inches(2), Inches(2), chart_data).chart
                chart.has_legend = False

            if report_config.get('showRiskBandsLegend', True):
                txBox = slide.shapes.add_textbox(Inches(2.6), y_offset, Inches(2), Inches(2))
                tf = txBox.text_frame
                tf.text = "Risk Level Legend:\n- Low Risk\n- Medium Risk\n- High Risk\n- Extreme Risk"
                tf.paragraphs[0].font.bold = True
                tf.paragraphs[0].font.size = Pt(12)

            if report_config.get('showRiskBandsCrashTypes', True):
                txBox = slide.shapes.add_textbox(Inches(4.5), y_offset, Inches(4), Inches(0.5))
                tf = txBox.text_frame
                tf.text = "Risk by Crash Type"
                tf.paragraphs[0].font.bold = True
                
                # Render the 4 crash types if their toggles are enabled
                cx = Inches(1.2)
                cy = Inches(1.2)
                chart_y = y_offset + Inches(0.6)
                
                if report_config.get('showRiskBandsVB', True):
                    chart_data = ChartData()
                    chart_data.categories = ['L','M','H','E']
                    chart_data.add_series('VB', (20,20,30,30))
                    chart = slide.shapes.add_chart(XL_CHART_TYPE.PIE, Inches(4.5), chart_y, cx, cy, chart_data).chart
                    chart.has_title = True
                    chart.chart_title.text_frame.text = "VB"
                    chart.has_legend = False

                if report_config.get('showRiskBandsBB', True):
                    chart_data = ChartData()
                    chart_data.categories = ['L','M','H','E']
                    chart_data.add_series('BB', (50,20,20,10))
                    chart = slide.shapes.add_chart(XL_CHART_TYPE.PIE, Inches(5.8), chart_y, cx, cy, chart_data).chart
                    chart.has_title = True
                    chart.chart_title.text_frame.text = "BB"
                    chart.has_legend = False

                if report_config.get('showRiskBandsSB', True):
                    chart_data = ChartData()
                    chart_data.categories = ['L','M','H','E']
                    chart_data.add_series('SB', (30,40,20,10))
                    chart = slide.shapes.add_chart(XL_CHART_TYPE.PIE, Inches(7.1), chart_y, cx, cy, chart_data).chart
                    chart.has_title = True
                    chart.chart_title.text_frame.text = "SB"
                    chart.has_legend = False

                if report_config.get('showRiskBandsBP', True):
                    chart_data = ChartData()
                    chart_data.categories = ['L','M','H','E']
                    chart_data.add_series('BP', (60,20,10,10))
                    chart = slide.shapes.add_chart(XL_CHART_TYPE.PIE, Inches(8.4), chart_y, cx, cy, chart_data).chart
                    chart.has_title = True
                    chart.chart_title.text_frame.text = "BP"
                    chart.has_legend = False

        # Save to a BytesIO object and return
        output = io.BytesIO()
        prs.save(output)
        output.seek(0)
        
        return send_file(
            output,
            as_attachment=True,
            download_name="PSAT_Report.pptx",
            mimetype="application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@bp.route('/segment-details', methods=['POST'])
def segment_details():
    """
    For a list of { project, segIndex } references (segIndex is 1-based),
    return each segment's image URL and top 3 contributing risk attributes.
    """
    try:
        import pandas as pd
        from app.services.project_manager import project_manager
        from app.services.cyclerap_scoring import LOOKUP_TABLES

        data = request.json
        segments = data.get("segments", [])

        # Maps LOOKUP_TABLES key → (CSV column name, human display name, safe default)
        ATTR_MAP = {
            'loose_surface':          ("Loose or slippery surface",                           "Loose Surface",           2),
            'tram_rails':             ("Tram or Train Rails",                                 "Tram/Train Rails",        2),
            'delineation':            ("Delineation",                                         "Delineation",             2),
            'light_segregation':      ("Light Segregation",                                   "Light Segregation",       2),
            'facility_width':         ("Facility Width per Direction",                        "Facility Width",          3),
            'flow_direction':         ("Flow Direction",                                       "Flow Direction",          1),
            'width_restriction':      ("Width Restriction",                                   "Width Restriction",       2),
            'adjacent_parking_0_1m':  ("Adjacent Vehicle Parking 0-1m",                      "Adj. Parking 0-1m",       2),
            'adjacent_hazard_0_1m':   ("Adjacent Severe Hazard 0-1m",                        "Adj. Hazard 0-1m",        2),
            'adjacent_parking_1_3m':  ("Adjacent Vehicle Parking 1-3m",                      "Adj. Parking 1-3m",       2),
            'adjacent_hazard_1_3m':   ("Adjacent Severe Hazard 1-3m",                        "Adj. Hazard 1-3m",        2),
            'grade':                  ("Grade",                                               "Grade",                   1),
            'curvature':              ("Curvature",                                           "Curvature",               2),
            'street_lighting':        ("Street Lighting",                                     "Street Lighting",         1),
            'pedestrian_crossing':    ("Pedestrian Crossing",                                 "Pedestrian Crossing",     2),
            'intersecting_facility':  ("Intersecting Bicycle Facility",                       "Intersecting Facility",   2),
            'intersection_crossing':  ("Intersection or Road Crossing",                       "Intersection Crossing",   2),
            'crossing_facility':      ("Crossing Facility",                                   "Crossing Facility",       1),
            'num_lanes_adjacent':     ("Number of lanes – adjacent road",               "Adj. Lane Count",         1),
            'num_lanes_intersecting': ("Number of lanes – intersecting road",           "Intersect. Lanes",        1),
            'property_access':        ("Property Access",                                     "Property Access",         2),
            'pedestrian_flow':        ("Peak pedestrian flow along or across facility",       "Pedestrian Flow",         1),
            'bicycle_flow':           ("Peak bicycle/LV traffic flow",                        "Bicycle Flow",            1),
            'cargo_bikes':            ("Observed proportion of cargo bikes and mopeds",       "Cargo Bikes",             1),
            'bicycle_speed':          ("Bicycle/LV speed – average",                    "Bicycle Speed",           1),
            'speed_differential':     ("Bicycle/LV speed differential",                      "Speed Differential",      1),
            'heavy_vehicle':          ("Heavy vehicle flow",                                  "Heavy Vehicle Flow",      1),
            'line_of_sight':          ("Line of Sight",                                       "Line of Sight",           1),
        }

        pm = project_manager()
        results = []

        for seg_ref in segments:
            project_name = seg_ref.get("project", "")
            seg_index_1based = int(seg_ref.get("segIndex", 1))
            seg_index = seg_index_1based - 1  # convert to 0-based

            try:
                proj = pm.project(project_name)
                ver = proj.latest()
                attrs_df = ver.attributes.df

                if attrs_df is None or seg_index < 0 or seg_index >= len(attrs_df):
                    raise ValueError(f"Segment index {seg_index} out of range")

                row = attrs_df.iloc[seg_index]

                image_ref = str(row.get("Image Reference", "") or "").strip()
                image_url = f"/api/projects/{project_name}/images/{image_ref}" if image_ref else None

                contributions = []
                for attr_key, (field_name, display_name, default_val) in ATTR_MAP.items():
                    raw_val = row.get(field_name, None)
                    try:
                        val = int(raw_val) if (raw_val is not None and pd.notna(raw_val)) else default_val
                    except (ValueError, TypeError):
                        val = default_val
                    risk = LOOKUP_TABLES.get(attr_key, {}).get(val, {}).get('risk', 1.0)
                    if risk > 1.0:
                        contributions.append({'name': display_name, 'multiplier': round(risk, 2)})

                contributions.sort(key=lambda x: -x['multiplier'])
                results.append({
                    'project': project_name,
                    'segIndex': seg_index_1based,
                    'imageUrl': image_url,
                    'topAttributes': contributions[:3],
                })
            except Exception:
                results.append({
                    'project': project_name,
                    'segIndex': seg_index_1based,
                    'imageUrl': None,
                    'topAttributes': [],
                })

        return jsonify({"ok": True, "details": results})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@bp.route('/generate-docx', methods=['POST'])
def generate_docx():
    try:
        from docx import Document
        from docx.shared import Pt, Cm, RGBColor as DocxRGB
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from datetime import date

        data = request.json
        selected_projects = data.get("selectedProjects", [])
        elements = data.get("elements", [])
        score_data = data.get("scoreData") or {}
        total_segments = data.get("totalSegments", 0)
        top_risk_rows = data.get("topRiskRows", [])

        doc = Document()

        # A4 page with comfortable margins
        section = doc.sections[0]
        section.page_width = Cm(21)
        section.page_height = Cm(29.7)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)

        BAND_LABELS = {1: "Low", 2: "Medium", 3: "High", 4: "Extreme"}
        CRASH_TYPE_LABELS = {
            "Overall": "Overall Risk",
            "VB": "Vehicle–Bicycle (VB)",
            "BB": "Bicycle–Bicycle (BB)",
            "SB": "Single-Bicycle (SB)",
            "BP": "Bicycle–Pedestrian (BP)",
        }

        # Sort visible elements by their vertical position on the canvas
        visible_elements = sorted(
            [e for e in elements if e.get("visible", True)],
            key=lambda e: e.get("y", 0)
        )

        for el in visible_elements:
            el_type = el.get("type")

            if el_type == "title":
                h = doc.add_heading("Path Analysis Executive Summary", level=1)
                h.alignment = WD_ALIGN_PARAGRAPH.CENTER
                if selected_projects:
                    p = doc.add_paragraph(f"Projects: {', '.join(selected_projects)}")
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_date = doc.add_paragraph(f"Generated: {date.today().strftime('%d %B %Y')}")
                p_date.alignment = WD_ALIGN_PARAGRAPH.CENTER
                doc.add_paragraph()

            elif el_type == "summary":
                doc.add_heading("Summary", level=2)
                p1 = doc.add_paragraph()
                p1.add_run("Projects Analyzed: ").bold = True
                p1.add_run(str(len(selected_projects)))
                p2 = doc.add_paragraph()
                p2.add_run("Total Segments: ").bold = True
                p2.add_run(str(total_segments))
                doc.add_paragraph()

            elif el_type == "riskBands":
                doc.add_heading("Risk Band Distribution", level=2)
                if score_data:
                    for crash_key, crash_label in CRASH_TYPE_LABELS.items():
                        dist = score_data.get(crash_key, {})
                        if not dist:
                            continue
                        # Accept both string and int keys
                        total = sum(int(v) for v in dist.values())
                        if total == 0:
                            continue

                        doc.add_heading(crash_label, level=3)
                        table = doc.add_table(rows=1, cols=3)
                        table.style = "Table Grid"
                        hdr = table.rows[0].cells
                        hdr[0].text = "Risk Band"
                        hdr[1].text = "Segments"
                        hdr[2].text = "Percentage"
                        for band_num in [1, 2, 3, 4]:
                            count = int(dist.get(band_num, dist.get(str(band_num), 0)))
                            pct = (count / total * 100) if total > 0 else 0
                            row = table.add_row().cells
                            row[0].text = BAND_LABELS.get(band_num, str(band_num))
                            row[1].text = str(count)
                            row[2].text = f"{pct:.1f}%"
                        doc.add_paragraph()
                else:
                    doc.add_paragraph("No score data available.")
                    doc.add_paragraph()

            elif el_type == "map":
                doc.add_heading("Map View", level=2)
                p = doc.add_paragraph(
                    "[Insert map screenshot here — use the map view from the Path Analysis page]"
                )
                p.runs[0].italic = True
                p.runs[0].font.color.rgb = DocxRGB(0x88, 0x88, 0x88)
                doc.add_paragraph()

            elif el_type == "topRisk":
                doc.add_heading("Top Risk Segments", level=2)
                if top_risk_rows:
                    table = doc.add_table(rows=1, cols=7)
                    table.style = "Table Grid"
                    hdr = table.rows[0].cells
                    for i, h in enumerate(["#", "Project", "Segment", "VB", "BB", "SB", "BP"]):
                        hdr[i].text = h
                    BAND_LABELS_SHORT = {1: "Low", 2: "Med", 3: "High", 4: "Extreme"}
                    for rank, row in enumerate(top_risk_rows, start=1):
                        cells = table.add_row().cells
                        cells[0].text = str(rank)
                        cells[1].text = str(row.get("_project", ""))
                        cells[2].text = str(row.get("_segIndex", ""))
                        cells[3].text = BAND_LABELS_SHORT.get(row.get("VB Band", 0), "—")
                        cells[4].text = BAND_LABELS_SHORT.get(row.get("BB Band", 0), "—")
                        cells[5].text = BAND_LABELS_SHORT.get(row.get("SB Band", 0), "—")
                        cells[6].text = BAND_LABELS_SHORT.get(row.get("BP Band", 0), "—")
                    doc.add_paragraph()
                else:
                    doc.add_paragraph("No segment score data available.")
                    doc.add_paragraph()

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        return send_file(
            output,
            as_attachment=True,
            download_name="PSAT_Report.docx",
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
