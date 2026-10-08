/**
 * https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SPREADSHEET_ID/
 */
const APP_CONFIG = {
  spreadsheetId: 'PASTE_YOUR_SHEET_HERE',
  sheets: {
    projects: 'Projects',
    categories: 'Categories',
    expenses: 'Expenses',
    income: 'Income',
    authorizedUsers: 'AuthorizedUsers'
  },
  auditFields: ['date_created', 'created_by', 'date_updated', 'updated_by']
};

/**
 * Opens the exact Budget Tracker spreadsheet used by this web app.
 * Keeping the ID explicit removes any dependency on an active spreadsheet
 * or stale Script Properties when the code runs as a deployed web app.
 */
function getSpreadsheet_() {
  try {
    return SpreadsheetApp.openById(APP_CONFIG.spreadsheetId);
  } catch (err) {
    throw new Error('Unable to open the configured Budget Tracker spreadsheet. Spreadsheet ID: ' + APP_CONFIG.spreadsheetId);
  }
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('School - Budget Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * One-time, non-destructive schema helper.
 * Run this manually from Apps Script once after replacing the code.
 * It renames known legacy headers and appends missing required columns.
 */
function setupBudgetTracker() {
  var ss = getSpreadsheet_();

  ensureSheetSchema_(ss, APP_CONFIG.sheets.projects,
    ['project_id', 'title', 'amount_goal', 'date_created', 'created_by', 'date_updated', 'updated_by'],
    { beginning_balance: 'amount_goal' });

  ensureSheetSchema_(ss, APP_CONFIG.sheets.categories,
    ['project_id', 'category_id', 'title', 'description', 'flow_type', 'date_created', 'created_by', 'date_updated', 'updated_by'],
    { name: 'title', inflow: 'flow_type' });

  ensureSheetSchema_(ss, APP_CONFIG.sheets.expenses,
    ['transaction_id', 'category_id', 'date', 'amount', 'remarks', 'date_created', 'created_by', 'date_updated', 'updated_by']);

  ensureSheetSchema_(ss, APP_CONFIG.sheets.income,
    ['transaction_id', 'category_id', 'date', 'amount', 'remarks', 'date_created', 'created_by', 'date_updated', 'updated_by']);

  ensureSheetSchema_(ss, APP_CONFIG.sheets.authorizedUsers,
    ['email', 'can_add', 'can_edit', 'is_admin', 'is_active', 'date_created', 'created_by', 'date_updated', 'updated_by']);

  ensureTransactionIds_(ss.getSheetByName(APP_CONFIG.sheets.expenses));
  ensureTransactionIds_(ss.getSheetByName(APP_CONFIG.sheets.income));

  return { status: 'success', message: 'Budget tracker schema checked.' };
}

function getAllData() {
  var ss = getSpreadsheet_();
  var access = getCurrentUserAccess_(true);
  if (!access.is_active) throw new Error('Your account is disabled. Contact an administrator.');

  var projects = getSheetData_(ss, APP_CONFIG.sheets.projects);
  var categories = getSheetData_(ss, APP_CONFIG.sheets.categories);
  var expenses = getSheetData_(ss, APP_CONFIG.sheets.expenses);
  var income = getSheetData_(ss, APP_CONFIG.sheets.income);

  var categoryMap = {};
  categories.forEach(function (c) {
    categoryMap[String(c.category_id)] = c;
  });

  function enrichTransactions(rows, flowType, sheetName) {
    return rows.map(function (t) {
      var category = categoryMap[String(t.category_id)] || null;
      t.project_id = category ? category.project_id : '';
      t.category_title = category ? category.title : '';
      t.flow_type = flowType;
      t._sheet = sheetName;
      return t;
    });
  }

  var payload = {
    projects: projects,
    categories: categories,
    expenses: enrichTransactions(expenses, 'Expense', APP_CONFIG.sheets.expenses),
    income: enrichTransactions(income, 'Income', APP_CONFIG.sheets.income),
    currentUser: access,
    authorizedUsers: access.is_admin ? getAuthorizedUsers_() : []
  };

  // Final transport guard: google.script.run cannot serialize native Date values.
  // This makes the client payload safe even if a future field accidentally
  // contains a Date or another nested value produced by server-side code.
  return sanitizeForClient_(payload, ss.getSpreadsheetTimeZone());
}

function sanitizeForClient_(value, timeZone) {
  if (value === null || value === undefined) return value === undefined ? null : value;

  if (value instanceof Date) {
    return Utilities.formatDate(value, timeZone || Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }

  if (Array.isArray(value)) {
    return value.map(function (item) { return sanitizeForClient_(item, timeZone); });
  }

  if (typeof value === 'object') {
    var output = {};
    Object.keys(value).forEach(function (key) {
      output[key] = sanitizeForClient_(value[key], timeZone);
    });
    return output;
  }

  return value;
}

/**
 * Lightweight endpoint that can be called from the browser console or Apps Script
 * editor to confirm that the deployed server can see the live workbook.
 */
function getBudgetTrackerHealth() {
  var data = getAllData();
  return {
    spreadsheet_id: APP_CONFIG.spreadsheetId,
    projects: data.projects.length,
    categories: data.categories.length,
    expenses: data.expenses.length,
    income: data.income.length,
    user: data.currentUser
  };
}


/**
 * Manual connection test. Run from the Apps Script editor if the web app
 * loads but appears empty. The returned object contains only workbook metadata
 * and row counts; it does not modify data.
 */
function diagnoseBudgetTracker() {
  var ss = getSpreadsheet_();
  var result = {
    spreadsheet_name: ss.getName(),
    spreadsheet_id: ss.getId(),
    sheets: {}
  };

  Object.keys(APP_CONFIG.sheets).forEach(function (key) {
    var name = APP_CONFIG.sheets[key];
    var sheet = ss.getSheetByName(name);
    result.sheets[name] = sheet ? {
      rows: Math.max(sheet.getLastRow() - 1, 0),
      columns: sheet.getLastColumn()
    } : { missing: true };
  });

  var data = getAllData();
  result.returned = {
    projects: data.projects.length,
    categories: data.categories.length,
    expenses: data.expenses.length,
    income: data.income.length,
    user: data.currentUser
  };

  return result;
}

function saveProject(data) {
  return withDocumentLock_(function () {
    if (!data) throw new Error('Project data is required.');
    requireRecordPermission_(!!data._rowNum);

    var title = cleanText_(data.title);
    if (!title) throw new Error('Project title is required.');

    var amountGoal = parseOptionalNonNegativeNumber_(data.amount_goal, 'Amount goal');

    return upsertByHeaders_(APP_CONFIG.sheets.projects, {
      _rowNum: data._rowNum,
      project_id: data.project_id,
      title: title,
      amount_goal: amountGoal
    }, 'project_id', 'numeric');
  });
}

function saveCategory(data) {
  return withDocumentLock_(function () {
    if (!data) throw new Error('Category data is required.');
    requireRecordPermission_(!!data._rowNum);

    var projectId = cleanText_(data.project_id);
    var title = cleanText_(data.title);
    var flowType = normalizeFlowType_(data.flow_type);

    if (!projectId) throw new Error('Project is required.');
    if (!title) throw new Error('Category title is required.');
    if (!flowType) throw new Error('Flow type must be Income or Expense.');

    var ss = getSpreadsheet_();
    if (!getRowObjectByField_(ss, APP_CONFIG.sheets.projects, 'project_id', projectId)) {
      throw new Error('Selected project no longer exists. Reload the page and try again.');
    }

    var currentCategory = data._rowNum
      ? getRowObjectByRow_(ss, APP_CONFIG.sheets.categories, Number(data._rowNum))
      : (data.category_id ? getRowObjectByField_(ss, APP_CONFIG.sheets.categories, 'category_id', data.category_id) : null);

    if (currentCategory && categoryHasTransactions_(ss, currentCategory.category_id)) {
      var projectChanged = String(currentCategory.project_id) !== String(projectId);
      var flowChanged = normalizeFlowType_(currentCategory.flow_type) !== flowType;
      if (projectChanged || flowChanged) {
        throw new Error('This category already has transactions. Its Project and Flow Type cannot be changed; create a new category instead.');
      }
    }

    return upsertByHeaders_(APP_CONFIG.sheets.categories, {
      _rowNum: data._rowNum,
      category_id: data.category_id,
      project_id: projectId,
      title: title,
      description: cleanText_(data.description),
      flow_type: flowType
    }, 'category_id', 'numeric');
  });
}

/**
 * Creates multiple categories for one Project + Flow Type in a single write.
 * Used only by the Add Categories modal. Existing-category edits still use saveCategory().
 */
function saveCategoriesBatch(data) {
  return withDocumentLock_(function () {
    requireRecordPermission_(false);
    if (!data) throw new Error('Category batch is required.');

    var projectId = cleanText_(data.project_id);
    var flowType = normalizeFlowType_(data.flow_type);
    var rows = Array.isArray(data.rows) ? data.rows : [];

    if (!projectId) throw new Error('Project is required.');
    if (!flowType) throw new Error('Flow type must be Income or Expense.');
    if (!rows.length) throw new Error('Add at least one category.');

    var ss = getSpreadsheet_();
    if (!getRowObjectByField_(ss, APP_CONFIG.sheets.projects, 'project_id', projectId)) {
      throw new Error('Selected project no longer exists. Reload the page and try again.');
    }

    var cleaned = rows.map(function (r, index) {
      var title = cleanText_(r && r.title);
      var description = cleanText_(r && r.description);
      if (!title) throw new Error('Category is required on row ' + (index + 1) + '.');
      return { title: title, description: description };
    });

    var sheet = ss.getSheetByName(APP_CONFIG.sheets.categories);
    if (!sheet) throw new Error('Sheet not found: ' + APP_CONFIG.sheets.categories);
    var headers = getHeaders_(sheet);
    if (!headers.length) throw new Error('Categories sheet has no header row.');

    var nextId = getNextNumericId_(sheet, headers, 'category_id');
    var startRow = sheet.getLastRow() + 1;
    var now = new Date();
    var user = getCurrentUser_();
    var output = [];
    var values = [];

    cleaned.forEach(function (item, index) {
      var id = nextId + index;
      var obj = {
        project_id: projectId,
        category_id: id,
        title: item.title,
        description: item.description,
        flow_type: flowType,
        date_created: now,
        created_by: user,
        date_updated: now,
        updated_by: user
      };

      var rowData = headers.map(function (header) {
        var canonical = canonicalHeaderForWrite_(header);
        return Object.prototype.hasOwnProperty.call(obj, canonical) ? obj[canonical] : '';
      });
      values.push(rowData);
      output.push(rowToObject_(headers, rowData, ss.getSpreadsheetTimeZone(), startRow + index, false));
    });

    sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);

    return {
      status: 'success',
      action: 'created',
      count: output.length,
      records: sanitizeForClient_(output, ss.getSpreadsheetTimeZone())
    };
  });
}

/**
 * Transaction destination is derived from Categories.flow_type.
 * The form does not decide whether a row goes to Income or Expenses.
 */
function saveTransaction(data) {
  return withDocumentLock_(function () {
    if (!data) throw new Error('Transaction data is required.');
    requireRecordPermission_(!!data._rowNum);

    var ss = getSpreadsheet_();
    var categoryId = cleanText_(data.category_id);
    var projectId = cleanText_(data.project_id);
    var amount = parseRequiredPositiveNumber_(data.amount, 'Amount');
    var trxDate = parseDateInput_(data.date, ss.getSpreadsheetTimeZone());

    if (!categoryId) throw new Error('Category is required.');

    // Read only the matching category row instead of reloading the whole Categories sheet.
    var category = getRowObjectByField_(ss, APP_CONFIG.sheets.categories, 'category_id', categoryId);
    if (!category) throw new Error('Selected category no longer exists. Reload the page and try again.');

    if (projectId && String(category.project_id) !== String(projectId)) {
      throw new Error('Selected category does not belong to the selected project.');
    }

    var flowType = normalizeFlowType_(category.flow_type);
    if (!flowType) throw new Error('The selected category has no valid flow type.');

    var targetSheet = flowType === 'Income' ? APP_CONFIG.sheets.income : APP_CONFIG.sheets.expenses;
    var sourceSheet = cleanText_(data._sourceSheet);
    var sourceRow = Number(data._rowNum || 0);

    var payload = {
      transaction_id: data.transaction_id,
      category_id: categoryId,
      date: trxDate,
      amount: amount,
      remarks: cleanText_(data.remarks)
    };

    function finish(result) {
      result.targetSheet = targetSheet;
      if (result.record) {
        result.record.project_id = category.project_id;
        result.record.category_title = category.title || '';
        result.record.flow_type = flowType;
        result.record._sheet = targetSheet;
      }
      return result;
    }

    // Normal create.
    if (!sourceSheet || !sourceRow) {
      return finish(upsertByHeaders_(targetSheet, payload, 'transaction_id', 'uuid'));
    }

    if ([APP_CONFIG.sheets.income, APP_CONFIG.sheets.expenses].indexOf(sourceSheet) === -1) {
      throw new Error('Invalid source sheet.');
    }

    var source = ss.getSheetByName(sourceSheet);
    if (!source || sourceRow < 2 || sourceRow > source.getLastRow()) {
      throw new Error('The transaction row no longer exists. Reload the page and try again.');
    }

    // Same flow type: update in place.
    if (sourceSheet === targetSheet) {
      payload._rowNum = sourceRow;
      return finish(upsertByHeaders_(targetSheet, payload, 'transaction_id', 'uuid'));
    }

    // Flow type changed through a category change: move the transaction while
    // preserving original created audit values and transaction_id when available.
    var sourceHeaders = getHeaders_(source);
    var sourceValues = source.getRange(sourceRow, 1, 1, sourceHeaders.length).getValues()[0];
    var sourceObj = rowToObject_(sourceHeaders, sourceValues, ss.getSpreadsheetTimeZone(), sourceRow, true);

    payload.transaction_id = sourceObj.transaction_id || data.transaction_id || Utilities.getUuid();
    payload._auditSeed = {
      date_created: sourceObj._raw_date_created || sourceObj.date_created || '',
      created_by: sourceObj.created_by || ''
    };

    var moved = finish(upsertByHeaders_(targetSheet, payload, 'transaction_id', 'uuid'));
    source.deleteRow(sourceRow);

    moved.action = 'moved';
    moved.sourceSheet = sourceSheet;
    moved.sourceRow = sourceRow;
    return moved;
  });
}

function getSheetData_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1 || sheet.getLastColumn() === 0) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0].map(normalizeHeader_);
  var tz = ss.getSpreadsheetTimeZone();
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var raw = data[i];
    var hasData = raw.some(function (v) { return v !== '' && v !== null; });
    if (!hasData) continue;

    var obj = rowToObject_(headers, raw, tz, i + 1, false);

    // Compatibility aliases from the previous version.
    if (sheetName === APP_CONFIG.sheets.projects) {
      if (obj.amount_goal === undefined && obj.beginning_balance !== undefined) {
        obj.amount_goal = obj.beginning_balance;
      }
    }

    if (sheetName === APP_CONFIG.sheets.categories) {
      if (!obj.title && obj.name) obj.title = obj.name;
      if (!obj.flow_type && obj.inflow) obj.flow_type = obj.inflow;
      obj.flow_type = normalizeFlowType_(obj.flow_type) || obj.flow_type;
    }

    rows.push(obj);
  }

  return rows;
}

function rowToObject_(headers, row, tz, rowNum, includeRawDates) {
  var obj = { _rowNum: rowNum };

  for (var j = 0; j < headers.length; j++) {
    var h = headers[j];
    if (!h) continue;

    var val = row[j];
    if (val instanceof Date) {
      // Native Date objects cannot be returned through google.script.run.
      // Keep them only for server-side operations that explicitly request raw dates.
      if (includeRawDates === true) obj['_raw_' + h] = val;
      obj[h] = Utilities.formatDate(
        val,
        tz,
        h === 'date' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss'
      );
    } else {
      obj[h] = val;
    }
  }

  return obj;
}

function upsertByHeaders_(sheetName, data, idField, idStrategy) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var headers = getHeaders_(sheet);
  if (!headers.length) throw new Error('Sheet has no header row: ' + sheetName);

  var rowNum = Number(data._rowNum || 0);
  var isUpdate = rowNum >= 2;

  if (isUpdate && rowNum > sheet.getLastRow()) {
    throw new Error('Record no longer exists. Reload the page and try again.');
  }

  var existing = isUpdate
    ? sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0]
    : new Array(headers.length).fill('');

  var user = getCurrentUser_();
  var now = new Date();
  var idValue = cleanText_(data[idField]);

  if (!isUpdate && !idValue) {
    if (idStrategy === 'uuid') idValue = Utilities.getUuid();
    else if (idStrategy === 'email') idValue = cleanText_(data[idField]).toLowerCase();
    else idValue = String(getNextNumericId_(sheet, headers, idField));
  }

  var auditSeed = data._auditSeed || {};
  var rowData = [];

  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    var existingValue = existing[i];
    var canonicalHeader = canonicalHeaderForWrite_(header);

    if (header === idField) {
      rowData.push(isUpdate && existingValue !== '' ? existingValue : idValue);
      continue;
    }

    if (header === 'date_created') {
      rowData.push(isUpdate && existingValue !== ''
        ? existingValue
        : (auditSeed.date_created || now));
      continue;
    }

    if (header === 'created_by') {
      rowData.push(isUpdate && existingValue !== ''
        ? existingValue
        : (auditSeed.created_by || user));
      continue;
    }

    if (header === 'date_updated') {
      rowData.push(now);
      continue;
    }

    if (header === 'updated_by') {
      rowData.push(user);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(data, canonicalHeader)) {
      rowData.push(data[canonicalHeader]);
    } else if (Object.prototype.hasOwnProperty.call(data, header)) {
      rowData.push(data[header]);
    } else {
      rowData.push(isUpdate ? existingValue : '');
    }
  }

  if (isUpdate) {
    sheet.getRange(rowNum, 1, 1, rowData.length).setValues([rowData]);
  } else {
    rowNum = sheet.getLastRow() + 1;
    sheet.getRange(rowNum, 1, 1, rowData.length).setValues([rowData]);
  }

  var record = rowToObject_(headers, rowData, ss.getSpreadsheetTimeZone(), rowNum, false);

  return {
    status: 'success',
    action: isUpdate ? 'updated' : 'created',
    rowNum: rowNum,
    id: record[idField] || idValue || null,
    record: sanitizeForClient_(record, ss.getSpreadsheetTimeZone())
  };
}

function ensureSheetSchema_(ss, sheetName, requiredHeaders, aliases) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  aliases = aliases || {};

  if (sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }

  var headerValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var normalized = headerValues.map(normalizeHeader_);

  Object.keys(aliases).forEach(function (oldHeader) {
    var oldIndex = normalized.indexOf(oldHeader);
    var newHeader = aliases[oldHeader];
    var newIndex = normalized.indexOf(newHeader);

    if (oldIndex >= 0 && newIndex < 0) {
      sheet.getRange(1, oldIndex + 1).setValue(newHeader);
      normalized[oldIndex] = newHeader;
    }
  });

  requiredHeaders.forEach(function (header) {
    if (normalized.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      normalized.push(header);
    }
  });

  sheet.setFrozenRows(1);
}

function ensureTransactionIds_(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return;

  var headers = getHeaders_(sheet);
  var idIndex = headers.indexOf('transaction_id');
  if (idIndex < 0) return;

  var count = sheet.getLastRow() - 1;
  var range = sheet.getRange(2, idIndex + 1, count, 1);
  var values = range.getValues();
  var changed = false;

  for (var i = 0; i < values.length; i++) {
    if (!values[i][0]) {
      values[i][0] = Utilities.getUuid();
      changed = true;
    }
  }

  if (changed) range.setValues(values);
}

function getHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizeHeader_);
}

function getNextNumericId_(sheet, headers, idField) {
  var index = headers.indexOf(idField);
  if (index < 0) return 1;
  if (sheet.getLastRow() <= 1) return 1;

  var values = sheet.getRange(2, index + 1, sheet.getLastRow() - 1, 1).getValues();
  var maxId = 0;

  values.forEach(function (r) {
    var n = Number(r[0]);
    if (isFinite(n) && n > maxId) maxId = n;
  });

  return maxId + 1;
}

function categoryHasTransactions_(ss, categoryId) {
  var id = String(categoryId);
  return [APP_CONFIG.sheets.expenses, APP_CONFIG.sheets.income].some(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() <= 1) return false;
    var headers = getHeaders_(sheet);
    var index = headers.indexOf('category_id');
    if (index < 0) return false;
    var values = sheet.getRange(2, index + 1, sheet.getLastRow() - 1, 1).getValues();
    return values.some(function (r) { return String(r[0]) === id; });
  });
}

function getRowObjectByRow_(ss, sheetName, rowNum) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || rowNum < 2 || rowNum > sheet.getLastRow()) return null;
  var headers = getHeaders_(sheet);
  if (!headers.length) return null;
  var row = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  var hasData = row.some(function (v) { return v !== '' && v !== null; });
  if (!hasData) return null;
  return rowToObject_(headers, row, ss.getSpreadsheetTimeZone(), rowNum, false);
}

function getRowObjectByField_(ss, sheetName, field, value) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  var headers = getHeaders_(sheet);
  var index = headers.indexOf(field);
  if (index < 0) return null;

  var values = sheet.getRange(2, index + 1, sheet.getLastRow() - 1, 1).getValues();
  var target = String(value);
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === target) {
      return getRowObjectByRow_(ss, sheetName, i + 2);
    }
  }
  return null;
}

function findByField_(rows, field, value) {
  var target = String(value);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][field]) === target) return rows[i];
  }
  return null;
}

function normalizeHeader_(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalHeaderForWrite_(header) {
  if (header === 'beginning_balance') return 'amount_goal';
  if (header === 'name') return 'title';
  if (header === 'inflow') return 'flow_type';
  return header;
}

function normalizeFlowType_(value) {
  var s = String(value || '').trim().toLowerCase();
  if (s === 'income') return 'Income';
  if (s === 'expense' || s === 'expenses') return 'Expense';
  return '';
}

function cleanText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseOptionalNonNegativeNumber_(value, label) {
  if (value === '' || value === null || value === undefined) return '';
  var n = Number(value);
  if (!isFinite(n) || n < 0) throw new Error(label + ' must be zero or greater.');
  return n;
}

function parseRequiredPositiveNumber_(value, label) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) throw new Error(label + ' must be greater than zero.');
  return n;
}

function parseDateInput_(value, timeZone) {
  var s = cleanText_(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('A valid transaction date is required.');

  var d;
  try {
    d = Utilities.parseDate(s, timeZone || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } catch (err) {
    throw new Error('A valid transaction date is required.');
  }

  if (Utilities.formatDate(d, timeZone || Session.getScriptTimeZone(), 'yyyy-MM-dd') !== s) {
    throw new Error('A valid transaction date is required.');
  }
  return d;
}

function getCurrentUser_() {
  var email = cleanText_(Session.getActiveUser().getEmail()).toLowerCase();
  if (!email) {
    throw new Error('Unable to identify your Google account. Deploy the web app as "User accessing the web app" and sign in with Google.');
  }
  return email;
}

function toBool_(value) {
  if (value === true) return true;
  var s = String(value == null ? '' : value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function getAuthorizedUsers_() {
  return getSheetData_(getSpreadsheet_(), APP_CONFIG.sheets.authorizedUsers)
    .filter(function (u) { return cleanText_(u.email) !== ''; })
    .map(function (u) {
      return {
        _rowNum: u._rowNum,
        email: cleanText_(u.email).toLowerCase(),
        can_add: toBool_(u.can_add),
        can_edit: toBool_(u.can_edit),
        is_admin: toBool_(u.is_admin),
        is_active: toBool_(u.is_active),
        date_created: u.date_created || '',
        created_by: u.created_by || '',
        date_updated: u.date_updated || '',
        updated_by: u.updated_by || ''
      };
    });
}

function getCurrentUserAccess_(autoRegister) {
  var email = getCurrentUser_();
  var users = getAuthorizedUsers_();
  var user = users.find(function (u) { return u.email === email; }) || null;

  if (!user && autoRegister !== false) {
    user = registerCurrentUser_(email);
  }

  if (!user) {
    return { email: email, can_add: false, can_edit: false, is_admin: false, is_active: false };
  }

  var isAdmin = !!user.is_admin;
  return {
    email: email,
    can_add: isAdmin || !!user.can_add,
    can_edit: isAdmin || !!user.can_edit,
    is_admin: isAdmin,
    is_active: !!user.is_active
  };
}

function registerCurrentUser_(email) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(APP_CONFIG.sheets.authorizedUsers);
  if (!sheet) throw new Error('AuthorizedUsers sheet is missing. Run setupBudgetTracker() once.');

  var existing = getAuthorizedUsers_().find(function (u) { return u.email === email; });
  if (existing) return existing;

  var result = upsertByHeaders_(APP_CONFIG.sheets.authorizedUsers, {
    email: email,
    can_add: false,
    can_edit: false,
    is_admin: false,
    is_active: true
  }, 'email', 'email');

  return {
    _rowNum: result.rowNum,
    email: email,
    can_add: false,
    can_edit: false,
    is_admin: false,
    is_active: true
  };
}

function requireRecordPermission_(isUpdate) {
  var access = getCurrentUserAccess_(true);
  if (!access.is_active) throw new Error('Your account is disabled. Contact an administrator.');
  if (isUpdate && !access.can_edit) throw new Error('You do not have permission to edit records.');
  if (!isUpdate && !access.can_add) throw new Error('You do not have permission to add records.');
  return access;
}

function requireAdmin_() {
  var access = getCurrentUserAccess_(true);
  if (!access.is_active || !access.is_admin) throw new Error('Administrator access required.');
  return access;
}

function saveAuthorizedUser(data) {
  return withDocumentLock_(function () {
    var admin = requireAdmin_();
    if (!data) throw new Error('User data is required.');

    var email = cleanText_(data.email).toLowerCase();
    if (!email || email.indexOf('@') <= 0) throw new Error('A valid email address is required.');

    var users = getAuthorizedUsers_();
    var existing = data._rowNum
      ? users.find(function (u) { return Number(u._rowNum) === Number(data._rowNum); })
      : users.find(function (u) { return u.email === email; });

    if (existing && existing.email !== email) {
      throw new Error('User email cannot be changed. Create a new user instead.');
    }

    var isAdmin = toBool_(data.is_admin);
    var isActive = toBool_(data.is_active);

    if (existing && existing.email === admin.email) {
      if (!isActive) throw new Error('You cannot deactivate your own administrator account.');
      if (!isAdmin) throw new Error('You cannot remove your own administrator access.');
    }

    return upsertByHeaders_(APP_CONFIG.sheets.authorizedUsers, {
      _rowNum: existing ? existing._rowNum : '',
      email: email,
      can_add: isAdmin ? true : toBool_(data.can_add),
      can_edit: isAdmin ? true : toBool_(data.can_edit),
      is_admin: isAdmin,
      is_active: isActive
    }, 'email', 'email');
  });
}

function getUsersList() {
  requireAdmin_();
  return sanitizeForClient_(getAuthorizedUsers_(), getSpreadsheet_().getSpreadsheetTimeZone());
}

function withDocumentLock_(callback) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

// Automatic audit trail for direct edits made in the Sheets UI.
function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var trackedSheets = [
    APP_CONFIG.sheets.projects,
    APP_CONFIG.sheets.categories,
    APP_CONFIG.sheets.expenses,
    APP_CONFIG.sheets.income,
    APP_CONFIG.sheets.authorizedUsers
  ];
  if (trackedSheets.indexOf(sheet.getName()) === -1) return;

  var startRow = e.range.getRow();
  var endRow = e.range.getLastRow();
  if (endRow <= 1) return;

  var headers = getHeaders_(sheet);
  var startCol = e.range.getColumn() - 1;
  var endCol = e.range.getLastColumn() - 1;
  var editedHeaders = headers.slice(startCol, endCol + 1);

  if (editedHeaders.length && editedHeaders.every(function (h) {
    return APP_CONFIG.auditFields.indexOf(h) >= 0;
  })) return;

  var now = new Date();
  var user = getCurrentUser_();

  for (var row = Math.max(2, startRow); row <= endRow; row++) {
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j];
      var cell = sheet.getRange(row, j + 1);

      if (h === 'date_created' && cell.isBlank()) cell.setValue(now);
      if (h === 'created_by' && cell.isBlank()) cell.setValue(user);
      if (h === 'date_updated') cell.setValue(now);
      if (h === 'updated_by') cell.setValue(user);
    }
  }
}
