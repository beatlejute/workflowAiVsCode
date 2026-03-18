const fs = require('fs');

const newKeys = `,
  "command.recurring.new.title": "New Recurring Definition",
  "command.recurring.toggle.title": "Toggle Recurring Definition",
  "command.recurring.delete.title": "Delete Recurring Definition",
  "command.recurring.triggerNow.title": "Trigger Recurring Now",
  "command.recurring.openConfig.title": "Open Recurring Config",
  "Create Recurring Definition": "Create Recurring Definition",
  "Enter recurring definition ID (e.g., REC-001)": "Enter recurring definition ID (e.g., REC-001)",
  "ID is required": "ID is required",
  "ID can only contain letters, numbers, hyphens and underscores": "ID can only contain letters, numbers, hyphens and underscores",
  "Enter definition name": "Enter definition name",
  "Name is required": "Name is required",
  "Select entity type": "Select entity type",
  "Create tickets": "Create tickets",
  "Create plans": "Create plans",
  "Select trigger type": "Select trigger type",
  "Schedule-based trigger": "Schedule-based trigger",
  "Trigger when previous instance completes": "Trigger when previous instance completes",
  "Enter cron expression (e.g., 0 0 * * * for daily)": "Enter cron expression (e.g., 0 0 * * * for daily)",
  "Cron expression is required": "Cron expression is required",
  "Enter title template (use {0}, {1}, {2} as variables)": "Enter title template (use {date}, {n}, {trigger_value} as variables)",
  "Daily Task {0} #{1}": "Daily Task {date} #{n}",
  "Weekly Plan {0}": "Weekly Plan {n}",
  "Title template is required": "Title template is required",
  "Created recurring definition {0}: {1}": "Created recurring definition {0}: {1}",
  "Recurring definition created": "Recurring definition created",
  "Open Config": "Open Config",
  "Cancel": "Cancel",
  "No recurring definitions found": "No recurring definitions found",
  "Select recurring definition to toggle": "Select recurring definition to toggle",
  "Toggle Recurring Definition": "Toggle Recurring Definition",
  "Enabled": "Enabled",
  "Disabled": "Disabled",
  "Definition {0} not found": "Definition {0} not found",
  "Disabled recurring definition {0}": "Disabled recurring definition {0}",
  "Enabled recurring definition {0}": "Enabled recurring definition {0}",
  "Select recurring definition to delete": "Select recurring definition to delete",
  "Delete Recurring Definition": "Delete Recurring Definition",
  "Are you sure you want to delete recurring definition {0}?": "Are you sure you want to delete recurring definition {0}?",
  "Delete": "Delete",
  "Deleted recurring definition {0}": "Deleted recurring definition {0}",
  "Select recurring definition to trigger": "Select recurring definition to trigger",
  "Trigger Recurring Now": "Trigger Recurring Now",
  "On completion": "On completion",
  "Definition {0} is disabled. Enable it first.": "Definition {0} is disabled. Enable it first.",
  "Created {0}: {1}": "Created {0}: {1}",
  "Failed to trigger definition {0}: {1}": "Failed to trigger definition {0}: {1}",
  "Failed to open recurring config: {0}": "Failed to open recurring config: {0}",
  "Recurring service not available or workflow not found": "Recurring service not available or workflow not found",
  "Failed to create recurring definition. Check Output channel for details.": "Failed to create recurring definition. Check Output channel for details.",
  "Failed to create recurring definition: {0}": "Failed to create recurring definition: {0}",
  "Recurring service not available": "Recurring service not available",
  "Failed to toggle recurring definition. Check Output channel for details.": "Failed to toggle recurring definition. Check Output channel for details.",
  "Failed to toggle recurring definition: {0}": "Failed to toggle recurring definition: {0}",
  "Failed to delete recurring definition. Check Output channel for details.": "Failed to delete recurring definition. Check Output channel for details.",
  "Failed to delete recurring definition: {0}": "Failed to delete recurring definition: {0}",
  "Failed to trigger recurring definition. Check Output channel for details.": "Failed to trigger recurring definition. Check Output channel for details.",
  "Failed to trigger recurring definition: {0}": "Failed to trigger recurring definition: {0}",
  "Failed to open recurring config. Check Output channel for details.": "Failed to open recurring config. Check Output channel for details."
}`;

const langs = ['de','fr','es','it','ja','ko','zh-cn','zh-tw','pt-br'];
for (const lang of langs) {
  const p = 'l10n/bundle.l10n.' + lang + '.json';
  let c = fs.readFileSync(p, 'utf-8');
  if (c.includes('command.recurring.new.title')) {
    console.log(lang + ': already done');
    continue;
  }
  // Replace closing } with new keys + }
  c = c.replace(/\n\}[\s]*$/, newKeys);
  fs.writeFileSync(p, c, 'utf-8');
  console.log(lang + ': updated');
}

// Fix package.nls files
const nlsKeys = `
  "views.sidebar.recurring.name": "RECURRING",
  "command.recurring.new.title": "New Recurring Definition",
  "command.recurring.toggle.title": "Toggle Enable/Disable",
  "command.recurring.delete.title": "Delete Recurring Definition",
  "command.recurring.triggerNow.title": "Trigger Now",
  "command.recurring.openConfig.title": "Open Config"`;

const nlsLangs = ['de','fr','es','it','ja','ko','zh-cn','zh-tw','pt-br','ru','zh','pt'];
for (const lang of nlsLangs) {
  const p = 'package.nls.' + lang + '.json';
  if (!fs.existsSync(p)) { console.log('nls ' + lang + ': not found, skipping'); continue; }
  let c = fs.readFileSync(p, 'utf-8');
  if (c.includes('views.sidebar.recurring.name')) {
    console.log('nls ' + lang + ': already done');
    continue;
  }
  c = c.replace(/\n\}[\s]*$/, ',\n' + nlsKeys.trim() + '\n}');
  fs.writeFileSync(p, c, 'utf-8');
  console.log('nls ' + lang + ': updated');
}
