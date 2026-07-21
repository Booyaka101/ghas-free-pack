// Standalone SARIF 2.1.0 schema validation: node validate-sarif.js [file]
'use strict';
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'sarif-schema-2.1.0.json'), 'utf8'));
const target = process.argv[2] || path.join(__dirname, 'out', 'results.sarif');
const sarif = JSON.parse(fs.readFileSync(target, 'utf8'));

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
const validate = ajv.compile(schema);

if (validate(sarif)) {
  console.log('VALID: ' + target + ' conforms to the SARIF 2.1.0 JSON schema');
} else {
  console.error('INVALID: ' + target);
  console.error(JSON.stringify(validate.errors.slice(0, 20), null, 2));
  process.exit(1);
}
