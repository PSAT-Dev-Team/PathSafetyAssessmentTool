import initSqlJs from 'sql.js';

export async function readGeoPackage(filePath) {
  try {
    const SQL = await initSqlJs({
      locateFile: file => `https://sql.js.org/dist/${file}`
    });

    const response = await fetch(filePath);
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    const db = new SQL.Database(uint8Array);

    // First, let's see what columns exist
    const tableInfo = db.exec(`PRAGMA table_info(geo_data)`);
    console.log('Table columns:', tableInfo);

    // Find the geometry column
    let geometryColumn = 'geom';
    if (tableInfo && tableInfo[0]) {
      const columns = tableInfo[0].values;
      const possibleNames = ['geometry', 'geom', 'GEOMETRY', 'GEOM', 'the_geom', 'shape', 'SHAPE'];
      for (const col of columns) {
        if (possibleNames.includes(col[1])) {
          geometryColumn = col[1];
          console.log('Found geometry column:', geometryColumn);
          break;
        }
      }
    }

    const result = db.exec(`
      SELECT 
        "Image Reference",
        "Distance (Metres)",
        "${geometryColumn}"
      FROM geo_data
    `);

    if (!result || result.length === 0) {
      throw new Error('No data found in GeoPackage');
    }

    const columns = result[0].columns;
    const rows = result[0].values;

    const features = rows.map((row, rowIndex) => {
      const feature = {};
      
      columns.forEach((col, idx) => {
        if (col === geometryColumn) {
          try {
            const wkb = row[idx];
            feature.coordinates = parseGeoPackageGeometry(wkb);
          } catch (error) {
            console.error(`Error parsing geometry for row ${rowIndex}:`, error);
            feature.coordinates = [];
          }
        } else {
          feature[col] = row[idx];
        }
      });

      return feature;
    });

    // Filter out features with no coordinates
    const validFeatures = features.filter(f => f.coordinates && f.coordinates.length > 0);
    console.log(`Loaded ${validFeatures.length} of ${features.length} features`);

    db.close();
    return validFeatures;

  } catch (error) {
    console.error('Error reading GeoPackage:', error);
    throw error;
  }
}

/**
 * Parse GeoPackage geometry format
 * 
 * GeoPackage uses a specific binary format that includes:
 * - GeoPackage header (8 bytes)
 * - Standard WKB geometry
 * 
 * This is different from standard WKB!
 */
function parseGeoPackageGeometry(blob) {
  if (!blob || blob.length === 0) return [];

  const data = new Uint8Array(blob);
  const view = new DataView(data.buffer);
  
  // Log first few bytes for debugging
  const preview = Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log('Blob preview (hex):', preview);
  
  let offset = 0;
  
  // Check for GeoPackage magic bytes 'GP' (0x47 0x50)
  const byte0 = view.getUint8(0);
  const byte1 = view.getUint8(1);
  
  if (byte0 === 0x47 && byte1 === 0x50) {
    console.log('Found GeoPackage header');
    const version = view.getUint8(2);
    const flags = view.getUint8(3);
    
    const envelopeType = (flags >> 1) & 0x07;
    console.log(`Version: ${version}, Flags: ${flags}, Envelope: ${envelopeType}`);
    
    // Skip fixed header (8 bytes) + envelope
    offset = 8;
    const envelopeSizes = [0, 32, 48, 48, 64];
    offset += envelopeSizes[envelopeType] || 0;
    
    console.log(`Starting WKB parse at offset ${offset}`);
  } else {
    console.log('No GeoPackage header, assuming raw WKB');
  }
  
  // Verify we're at a valid WKB start
  const byteOrder = view.getUint8(offset);
  if (byteOrder !== 0 && byteOrder !== 1) {
    console.error(`Invalid byte order at offset ${offset}: ${byteOrder}`);
    return [];
  }
  
  return parseWKBGeometry(view, offset);
}

/**
 * Parse WKB geometry from a DataView starting at a specific offset
 */
function parseWKBGeometry(view, startOffset) {
  let offset = startOffset;
  
  // Read byte order (1 byte)
  const byteOrder = view.getUint8(offset);
  offset += 1;
  const littleEndian = byteOrder === 1;
  
  // Read geometry type (4 bytes)
  const geomType = view.getUint32(offset, littleEndian);
  offset += 4;
  
  // Extract base type (remove flags like Z, M, SRID)
  const baseType = geomType % 1000;
  
  // Check if geometry has Z coordinate (3D)
  const hasZ = (geomType >= 1000 && geomType < 2000) || (geomType >= 3000);
  
  // Check if geometry has M coordinate (measure)
  const hasM = geomType >= 2000;
  
  console.log(`Geometry type: ${geomType}, base: ${baseType}, hasZ: ${hasZ}, hasM: ${hasM}`);
  
  // Parse based on geometry type
  switch (baseType) {
    case 2: // LineString
      return parseLineString(view, offset, littleEndian, hasZ, hasM);
    case 1: // Point
      // If you have point geometries, handle them
      return [];
    case 5: // MultiLineString
      // If you have multi-line geometries, handle them
      return [];
    default:
      console.warn(`Unsupported geometry type: ${geomType}`);
      return [];
  }
}

/**
 * Parse a LineString from WKB
 */
function parseLineString(view, offset, littleEndian, hasZ, hasM) {
  // Read number of points
  const numPoints = view.getUint32(offset, littleEndian);
  offset += 4;
  
  console.log(`Parsing LineString with ${numPoints} points, hasZ: ${hasZ}, hasM: ${hasM}`);
  
  const coordinates = [];
  const coordsPerPoint = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);
  
  for (let i = 0; i < numPoints; i++) {
    try {
      // Read X
      const x = view.getFloat64(offset, littleEndian);
      offset += 8;
      
      // Read Y
      const y = view.getFloat64(offset, littleEndian);
      offset += 8;
      
      // Skip Z if present
      if (hasZ) {
        offset += 8;
      }
      
      // Skip M if present
      if (hasM) {
        offset += 8;
      }
      
      // Convert from SVY21 to WGS84
      const [lon, lat] = convertSVY21ToWGS84(x, y);
      coordinates.push([lon, lat]);
    } catch (error) {
      console.error(`Error parsing point ${i}:`, error);
      break;
    }
  }
  
  return coordinates;
}

/**
 * Convert from SVY21 (EPSG:3414) to WGS84 (EPSG:4326)
 * This is a simplified conversion - for production use proj4
 */
function convertSVY21ToWGS84(x, y) {
  // Singapore SVY21 parameters
  const originLat = 1.366666;
  const originLon = 103.833333;
  const falseNorthing = 38744.572;
  const falseEasting = 28001.642;
  
  // Simple approximation
  const lat = originLat + ((y - falseNorthing) / 111320);
  const lon = originLon + ((x - falseEasting) / (111320 * Math.cos(originLat * Math.PI / 180)));
  
  return [lon, lat];
}