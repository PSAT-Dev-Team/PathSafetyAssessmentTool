function doGet() {
  const properties = PropertiesService.getScriptProperties();
  return jsonResponse_({
    status: 'ok',
    ok: true,
    service: 'psat-report-receiver',
    environment: properties.getProperty('PSAT_ENVIRONMENT') || 'unknown',
    output_format: properties.getProperty('PSAT_OUTPUT_FORMAT') || 'google_sheet',
  });
}

function doPost(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = getRequiredProperty_(properties, 'PSAT_UPLOAD_SECRET');
    const folderId = getRequiredProperty_(properties, 'PSAT_DRIVE_FOLDER_ID');
    const outputFormat = normalizeOutputFormat_(properties.getProperty('PSAT_OUTPUT_FORMAT') || 'google_sheet');

    if (outputFormat !== 'google_sheet') {
      throw new Error('Unsupported PSAT_OUTPUT_FORMAT: ' + outputFormat);
    }

    const payload = parseRequestPayload_(e);
    validateSecret_(payload, expectedSecret);
    validateReportPayload_(payload);

    const report = payload.report;
    const batch = payload.batch || {};
    const result = createSpreadsheetReport_(folderId, report, batch);

    return jsonResponse_({
      status: 'ok',
      ok: true,
      spreadsheet_id: result.spreadsheetId,
      spreadsheet_url: result.spreadsheetUrl,
      file_name: result.fileName,
      folder_id: folderId,
      output_format: outputFormat,
      batch_id: batch.batch_id || null,
      report_type: report.report_type || null,
      window_start: (report.window || {}).start || null,
      window_end: (report.window || {}).end || null,
    });
  } catch (error) {
    return jsonResponse_({
      status: 'error',
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
}

function parseRequestPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing JSON request body.');
  }

  let parsed;
  try {
    parsed = JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('Request body is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request payload must be a JSON object.');
  }
  return parsed;
}

function validateSecret_(payload, expectedSecret) {
  const providedSecret = String(payload.secret || '').trim();
  if (!providedSecret) {
    throw new Error('Missing secret in request payload.');
  }
  if (providedSecret !== String(expectedSecret || '').trim()) {
    throw new Error('Invalid upload secret.');
  }
}

function validateReportPayload_(payload) {
  const report = payload.report;
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Missing report object in request payload.');
  }

  const window = report.window || {};
  if (!window.start || !window.end) {
    throw new Error('Report window start/end are required.');
  }

  if (!report.report_type) {
    throw new Error('Report type is required.');
  }
}

function normalizeOutputFormat_(value) {
  return String(value || '').trim().toLowerCase() || 'google_sheet';
}

function getRequiredProperty_(properties, key) {
  const value = String(properties.getProperty(key) || '').trim();
  if (!value) {
    throw new Error('Missing required Script Property: ' + key);
  }
  return value;
}

function createSpreadsheetReport_(folderId, report, batch) {
  const fileName = buildSpreadsheetName_(report);
  const spreadsheet = SpreadsheetApp.create(fileName);
  const file = DriveApp.getFileById(spreadsheet.getId());
  const folder = DriveApp.getFolderById(folderId);
  file.moveTo(folder);

  const summarySheet = spreadsheet.getSheets()[0];
  summarySheet.setName('Summary');
  writeKeyValueSheet_(summarySheet, buildSummaryRows_(report, batch));

  writeTableSheet_(spreadsheet.insertSheet('Event Totals'), keyValueObjects_(report.event_totals, 'event_type', 'count'));
  writeTableSheet_(spreadsheet.insertSheet('Daily Activity'), arrayOrEmpty_(report.daily_activity));
  writeTableSheet_(spreadsheet.insertSheet('Divisions'), arrayOrEmpty_(report.divisions));
  writeTableSheet_(spreadsheet.insertSheet('Profiles'), arrayOrEmpty_(report.profiles));
  writePrettyJsonSheet_(spreadsheet.insertSheet('Raw Report'), report);

  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    fileName: fileName,
  };
}

function buildSummaryRows_(report, batch) {
  const installation = report.installation || {};
  const window = report.window || {};
  const summary = report.summary || {};
  return [
    ['report_type', report.report_type || ''],
    ['generated_at', report.generated_at || ''],
    ['installation_id', installation.installation_id || ''],
    ['installation_scope', installation.scope || ''],
    ['window_start', window.start || ''],
    ['window_end', window.end || ''],
    ['total_events', summary.total_events || 0],
    ['active_profiles', summary.active_profiles || 0],
    ['division_count', summary.division_count || 0],
    ['batch_id', batch.batch_id || ''],
    ['attempted_at', batch.attempted_at || ''],
  ];
}

function buildSpreadsheetName_(report) {
  const window = report.window || {};
  const startToken = sanitizeFileToken_(window.start || 'start');
  const endToken = sanitizeFileToken_(window.end || 'end');
  return 'psat-weekly-activity-' + startToken + '_to_' + endToken;
}

function sanitizeFileToken_(value) {
  return String(value || '')
    .replace(/[T:]/g, '-')
    .replace(/[+.]/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'value';
}

function writeKeyValueSheet_(sheet, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([['field', 'value']]);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
  styleHeader_(sheet, 1, 2);
  sheet.autoResizeColumns(1, 2);
  sheet.setFrozenRows(1);
}

function writeTableSheet_(sheet, rows) {
  const normalizedRows = arrayOrEmpty_(rows);
  sheet.clearContents();

  if (!normalizedRows.length) {
    sheet.getRange(1, 1, 1, 1).setValue('No rows');
    return;
  }

  const headers = collectHeaders_(normalizedRows);
  const grid = [headers];
  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index] || {};
    grid.push(headers.map(function(header) {
      return serializeCell_(row[header]);
    }));
  }

  sheet.getRange(1, 1, grid.length, headers.length).setValues(grid);
  styleHeader_(sheet, 1, headers.length);
  sheet.autoResizeColumns(1, headers.length);
  sheet.setFrozenRows(1);
}

function writePrettyJsonSheet_(sheet, value) {
  const lines = JSON.stringify(value, null, 2).split('\n').map(function(line) {
    return [line];
  });
  sheet.clearContents();
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.getRange(1, 1, lines.length, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sheet.autoResizeColumn(1);
}

function collectHeaders_(rows) {
  const headers = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    Object.keys(row).forEach(function(key) {
      if (headers.indexOf(key) === -1) {
        headers.push(key);
      }
    });
  }
  return headers;
}

function keyValueObjects_(obj, keyLabel, valueLabel) {
  const source = obj && typeof obj === 'object' ? obj : {};
  return Object.keys(source)
    .sort()
    .map(function(key) {
      const row = {};
      row[keyLabel] = key;
      row[valueLabel] = source[key];
      return row;
    });
}

function arrayOrEmpty_(value) {
  return Array.isArray(value) ? value : [];
}

function serializeCell_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value);
  }
  return value;
}

function styleHeader_(sheet, row, width) {
  sheet.getRange(row, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#d9ead3');
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}