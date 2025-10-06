#!/usr/bin/env python
# coding: utf-8

# ### NOTE TO USER
# 1. This Jupyter Notebook requires the use of exiftool to access media metadata.
# 2. You may refer to https://exif.tools/ for immediate extraction of metadata or https://exiftool.org/ to download the appropriate executables depending on your OS.
# 3. This Jupyter Notebook also requires the use of geopandas and its dependencies (pyproj, shapely, folium, mapclassify, branca, etc.) for geospatial data manipulation.

# IMPORT PACKAGES
import os
import subprocess
import pandas as pd
import geopandas as gpd
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime
import hashlib
import re
from shapely.geometry import Point, LineString
from shapely.ops import unary_union
import json
import cv2
import geopy.distance
from shapely.ops import nearest_points

def gdfify(gdf):
    gdf = gpd.GeoDataFrame(gdf)
    try:
        gdf = gdf.to_crs(4326)
    except:
        gdf = gdf.set_crs(4326)
    return(gdf)

def toDecimal(dms):
    match = re.match(r'(\d+) deg (\d+)\s*\'\s*(\d+\.\d*)\s*\"\s*([NSEW])', dms)
    if not match:
        raise ValueError(f"Invalid DMS format: {dms}")
    degrees = float(match.group(1))
    minutes = float(match.group(2))
    seconds = float(match.group(3))
    direction = match.group(4)
    decimal_degrees = degrees + minutes / 60 + seconds / 3600
    if direction in ['S', 'W']:
        decimal_degrees *= -1
    return(decimal_degrees)

def geoCode(df, long = 'LONGITUDE', lat = 'LATITUDE'):
    gdf = gpd.GeoDataFrame(df, geometry = gpd.points_from_xy(df[long], df[lat]), crs='epsg:3414')
    return(gdf.drop(columns = [long, lat]))

def extractGPS(filepath):
    command = ['exiftool', '-ee', '-gpslatitude', '-gpslongitude', '-gpsdatetime', filepath]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        print(f"Error running exiftool: {result.stderr.decode('utf-8')}")
        return None
    
    outputs = result.stdout.decode('utf-8').split('\n')
    lats = [toDecimal(output.split(':')[-1].strip()) for output in outputs if 'Latitude' in output]
    longs = [toDecimal(output.split(':')[-1].strip()) for output in outputs if 'Longitude' in output]
    
    if result.returncode != 0:
        print(f"Error running exiftool: {result.stderr.decode('utf-8')}")
        return None  # Return None to indicate failure

    if len(lats) > 0 and len(longs) > 0:
        df = pd.DataFrame({'LATITUDE': lats, 'LONGITUDE': longs})
        # print(f'GPS METADATA FOUND: {df}')
        return(df)
    else:
        print('NO GPS METADATA FOUND')

def getBuffer(gdf, buffer):
    gdf_buffer = gdf.to_crs(3857)
    gdf_buffer['geometry'] = gdf_buffer['geometry'].buffer(distance = int(buffer))
    gdf_buffer = gdf_buffer.to_crs(4326)
    return(gdf_buffer)

import geopandas as gpd
import pandas as pd
from geopandas.tools import sjoin

def snaptoLink(raw, link, t=45):
    # # Ensure both GeoDataFrames have a defined CRS
    # if raw.crs is None or link.crs is None:
    #     raise ValueError("Both GeoDataFrames must have a defined CRS.")

    # target_crs = 3857 if link.crs.is_geographic else link.crs
    # raw = raw.to_crs(epsg=target_crs) if raw.crs != target_crs else raw
    # link = link.to_crs(epsg=target_crs) if link.crs != target_crs else link

    # # # If the CRS is geographic (EPSG:4326), project to a suitable CRS (e.g., EPSG:3857)
    # # if link.crs.is_geographic:
    # #     raw = raw.to_crs(epsg=3857)
    # #     link = link.to_crs(epsg=3857)
    # # # Ensure both GeoDataFrames have the same CRS and project to a suitable CRS (e.g., EPSG:3857)
    # # elif raw.crs != link.crs:
    # #     raw = raw.to_crs(link.crs)

    # shply_line = link.geometry.unary_union
    # buff = shply_line.buffer(t)

    # buff = gpd.GeoDataFrame(geometry=[buff])
    # buff = buff.set_crs(raw.crs)
    # pointInPolys = sjoin(raw,buff, how='left')
    # newPoly = pointInPolys.dropna(subset=['index_right'])

    # result = newPoly.copy()
    # result['geometry'] = result.apply(lambda row: shply_line.interpolate(shply_line.project( row.geometry)), axis=1)
    # return result
    # Convert df to GeoDataFrame if it's a DataFrame
    if not isinstance(raw, gpd.GeoDataFrame):
        if 'geometry' in raw.columns:
            raw = gpd.GeoDataFrame(raw, geometry=raw['geometry'], crs="EPSG:4326")
        else:
            raise ValueError("df must have a 'geometry' column.")
        
    # Ensure CRS is defined
    if raw.crs is None or link.crs is None:
        raise ValueError("Both GeoDataFrames must have a defined CRS.")

    # Convert CRS to match shapeFileLink (SVY21 assumed)
    target_crs = link.crs if link.crs.is_projected else "EPSG:3414"
    raw = raw.to_crs(target_crs)
    link = link.to_crs(target_crs)

    # Snapping logic (find nearest footpath segment)
    def snap_to_nearest(point):
        nearest_line = link.geometry.distance(point).idxmin()
        nearest_geom = link.geometry.iloc[nearest_line]
        snapped_point = nearest_points(point, nearest_geom)[1]

        return snapped_point if point.distance(snapped_point) <= t else point

    raw["geometry"] = raw.geometry.apply(snap_to_nearest)

    # Convert back to WGS84 if needed
    raw = raw.to_crs(epsg=4326)
    
    return raw

    
def getDuration(file_path):
    result = subprocess.run(["exiftool", file_path], capture_output=True, text=True)
    output = result.stdout
    match = re.search(r"Duration\s+:\s+(\d+:\d+:\d+)", output)
    
    if match:
        duration_str = match.group(1)
        h, m, s = map(int, duration_str.split(':'))
        duration_in_seconds = h * 3600 + m * 60 + s
        return(duration_in_seconds)
    else:
        raise ValueError("Could not find duration in exiftool output")

def getTimestamp(file_path):
    command = ['exiftool', '-ee', '-gpsdatetime', file_path]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    outputs = result.stdout.decode('utf-8').split('\n')
    timestamps = [output.split(':', 1)[-1].strip() for output in outputs if 'GPS Date Time' in output]

    if len(timestamps) > 0:
        # print('GPS METADATA FOUND')
        df = pd.DataFrame({'TIMESTAMP': timestamps})
        return(df)
    else:
        raise ValueError('NO GPS METADATA FOUND')

def calculate_average_time_difference(df):
    # Convert 'TIMESTAMP' column to datetime objects
    df['TIMESTAMP'] = pd.to_datetime(df['TIMESTAMP'], format='%Y:%m:%d %H:%M:%S.%f')

    # Calculate time differences between consecutive timestamps
    df['TIME_DIFF'] = df['TIMESTAMP'].diff().dt.total_seconds()

    # Remove any NaN values in the 'TIME_DIFF' column (the first row will be NaN)
    df = df.dropna(subset=['TIME_DIFF'])

    # Calculate the average time difference
    avg_time_diff = df['TIME_DIFF'].mean()

    # Calculate frequency as the inverse of average time difference
    frequency = 1 / avg_time_diff if avg_time_diff > 0 else None

    return avg_time_diff, frequency

def extractSpeed(filepath):
    command = ['exiftool', '-ee', '-gpsspeed', filepath]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    outputs = result.stdout.decode('utf-8').split('\n')
    speeds = [float(output.split(':')[-1].strip()) for output in outputs if 'Speed' in output]
    if len(speeds) > 0:
        # print('SPEED METADATA FOUND')
        df = pd.DataFrame({'SPEED': speeds})
        return(df)
    else:
        print('NO SPEED METADATA FOUND')

def makeLineStrings(gdf):
    lines = []
    speeds = []
    for i in range(len(gdf) - 1):
        point1 = gdf.geometry.iloc[i]
        point2 = gdf.geometry.iloc[i + 1]
        line = LineString([point1, point2])
        speed = np.mean(gdf.SPEED.iloc[i] + gdf.SPEED.iloc[i +1])
        lines.append(line)
        speeds.append(speed)
    line_gdf = gpd.GeoDataFrame(geometry=lines, crs=gdf.crs)
    line_gdf['SPEED'] = speeds
    return(line_gdf)