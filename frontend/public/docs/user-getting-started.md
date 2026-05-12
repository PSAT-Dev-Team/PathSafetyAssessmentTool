# Path Safety Assessment Tool (PSAT) User Guide

Welcome to PSAT. The tool helps you create projects from geotagged survey images, review coded path segments, calculate safety risk scores, analyse safety hazards and test treatments.

---

## Table of Contents

- [1. Getting Started](#1-getting-started)
  - [1.1 Open the Project List](#11-open-the-project-list)
  - [1.2 Create a Project](#12-create-a-project)
  - [1.3 Navigate Between Workflows](#13-navigate-between-workflows)
  - [1.4 Using the Help Guide](#14-using-the-help-guide)
  - [1.5 Viewing and Updating GIS Layers](#15-viewing-and-updating-gis-layers)

---

## 1. Getting Started

### 1.1 Open the Project List

Use the **Home** page to browse all projects. You can:

- search by project name or road name
- filter by tag (e.g. NSC, AMK)
- sort by verification progress, autocode progress, and last modified time
- select one or more projects for coding, path analysis, or treatment work

### 1.2 Create a Project

Use **Create Project** when you want to build a new project from the source image folders in `in/`.

You can create a project in three ways:

1. **Single folder** — select one source folder directly
2. **Polygon / Planning Area** — draw a polygon or click a planning area on the map and create a project from multiple selected roads
3. **Upload area GIS layers** — upload area layers to define the project boundary

When creating a project:

- enter a project name without underscores
- add tags if needed (for easy grouping, e.g. NSC, AMK)
- upload images into a source folder if the folder is missing
- check that selected roads are marked as **available** before you create the project

### 1.3 Navigate Between Workflows

From the project list, you can send selected projects to:

| Workflow | Purpose |
|---|---|
| **Coding** | Detailed attribute review and saving |
| **Analyse Projects** | Multi-project filtering, charts, and exports |
| **Treatment Application** | Before/after scenario testing |

### 1.4 Using the Help Guide

Click the **Help** button (available from any page in the sidebar) to open the in-app guide. The Help page contains three tabs:

- **User Guide** — step-by-step instructions for all workflows (this guide)
- **Admin Guide** — system deployment, model management, and infrastructure
- **Developer Guide** — technical architecture, API reference, and scoring logic

### 1.5 Viewing and Updating GIS Layers

Click **View GIS Layers** from the sidebar to open the GIS Layers dashboard. This is separate from Help.

From the GIS Layers page you can:

- Browse all current layers grouped by category
- View required columns and metadata for each layer
- **Add** entirely new GIS layers for new categories
- **Replace** an existing layer with an updated file
- **Delete** a layer that is no longer needed

> For full GIS layer management instructions, see the **GIS Layer Management Guide** section.
