import * as assert from 'assert';
import {
  sanitizeTicketId,
  sanitizePath,
  sanitizeExecutablePath,
  sanitizeProcessId
} from '../../security/input-sanitizer';

suite('input-sanitizer', () => {
  suite('sanitizeTicketId', () => {
    suite('valid inputs', () => {
      test('accepts simple alphanumeric ticket ID', () => {
        assert.strictEqual(sanitizeTicketId('IMPL001'), 'IMPL001');
      });

      test('accepts ticket ID with dash', () => {
        assert.strictEqual(sanitizeTicketId('IMPL-001'), 'IMPL-001');
      });

      test('accepts ticket ID with underscore', () => {
        assert.strictEqual(sanitizeTicketId('IMPL_001'), 'IMPL_001');
      });

      test('accepts ticket ID with dot', () => {
        assert.strictEqual(sanitizeTicketId('IMPL.001'), 'IMPL.001');
      });

      test('accepts ticket ID with mixed valid characters', () => {
        assert.strictEqual(sanitizeTicketId('IMPL-001.test'), 'IMPL-001.test');
      });

      test('accepts lowercase ticket ID', () => {
        assert.strictEqual(sanitizeTicketId('impl-001'), 'impl-001');
      });

      test('accepts numeric-only ticket ID', () => {
        assert.strictEqual(sanitizeTicketId('12345'), '12345');
      });

      test('accepts empty string', () => {
        assert.strictEqual(sanitizeTicketId(''), '');
      });
    });

    suite('invalid inputs', () => {
      test('rejects path traversal attempt', () => {
        assert.throws(
          () => sanitizeTicketId('../etc/passwd'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects command injection with semicolon', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL-001; rm -rf /'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects command injection with dollar sign', () => {
        assert.throws(
          () => sanitizeTicketId('$(whoami)'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects command injection with backticks', () => {
        assert.throws(
          () => sanitizeTicketId('`whoami`'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects null byte injection', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL-001\0.txt'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects space characters', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL 001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like @', () => {
        assert.throws(
          () => sanitizeTicketId('user@host'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like #', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL#001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like $', () => {
        assert.throws(
          () => sanitizeTicketId('$IMPL-001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like &', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL&001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like |', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL|001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like >', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL>001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like <', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL<001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like !', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL!001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like ?', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL?001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like *', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL*001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like [', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL[001]'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like {', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL{001}'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like (', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL(001)'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like =', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL=001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like +', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL+001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like %', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL%001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like ^', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL^001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like ~', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL~001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects special characters like `', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL`001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects unicode tricks', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL\u00A0001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects newline characters', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL\n001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects tab characters', () => {
        assert.throws(
          () => sanitizeTicketId('IMPL\t001'),
          /Invalid input: ticket ID contains invalid characters/
        );
      });

      test('rejects non-string input (number)', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeTicketId(123),
          /Invalid input: ticket ID must be a string/
        );
      });

      test('rejects non-string input (null)', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeTicketId(null),
          /Invalid input: ticket ID must be a string/
        );
      });

      test('rejects non-string input (undefined)', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeTicketId(undefined),
          /Invalid input: ticket ID must be a string/
        );
      });

      test('rejects non-string input (object)', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeTicketId({}),
          /Invalid input: ticket ID must be a string/
        );
      });
    });
  });

  suite('sanitizePath', () => {
    suite('valid inputs', () => {
      test('accepts simple relative path', () => {
        assert.strictEqual(sanitizePath('src/index.ts'), 'src/index.ts');
      });

      test('accepts nested relative path', () => {
        assert.strictEqual(sanitizePath('src/utils/path-utils.ts'), 'src/utils/path-utils.ts');
      });

      test('accepts path with underscore', () => {
        assert.strictEqual(sanitizePath('src/my_file.ts'), 'src/my_file.ts');
      });

      test('accepts Windows-style path', () => {
        assert.strictEqual(sanitizePath('src\\utils\\path-utils.ts'), 'src\\utils\\path-utils.ts');
      });

      test('accepts Windows drive letter path', () => {
        assert.strictEqual(sanitizePath('C:/Users/test/file.txt'), 'C:/Users/test/file.txt');
      });

      test('accepts path with spaces', () => {
        assert.strictEqual(sanitizePath('my folder/file.txt'), 'my folder/file.txt');
      });

      test('accepts single file name', () => {
        assert.strictEqual(sanitizePath('file.txt'), 'file.txt');
      });

      test('accepts empty string', () => {
        assert.strictEqual(sanitizePath(''), '');
      });
    });

    suite('invalid inputs', () => {
      test('rejects path traversal with ../', () => {
        assert.throws(
          () => sanitizePath('../../../etc/passwd'),
          /Invalid input: path traversal detected/
        );
      });

      test('rejects path traversal with ..\\', () => {
        assert.throws(
          () => sanitizePath('..\\..\\..\\etc\\passwd'),
          /Invalid input: path traversal detected/
        );
      });

      test('rejects path traversal in middle of path', () => {
        assert.throws(
          () => sanitizePath('src/../../../etc/passwd'),
          /Invalid input: path traversal detected/
        );
      });

      test('rejects command injection with semicolon', () => {
        assert.throws(
          () => sanitizePath('/tmp; rm -rf /'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects command injection with dollar sign', () => {
        assert.throws(
          () => sanitizePath('/tmp/$(whoami)'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects command injection with backticks', () => {
        assert.throws(
          () => sanitizePath('/tmp/`whoami`'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects null byte injection', () => {
        assert.throws(
          () => sanitizePath('/tmp/file\0.txt'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects pipe character', () => {
        assert.throws(
          () => sanitizePath('/tmp/file|cat'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects ampersand character', () => {
        assert.throws(
          () => sanitizePath('/tmp/file&cat'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects redirect character', () => {
        assert.throws(
          () => sanitizePath('/tmp/file>output'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects unicode tricks', () => {
        assert.throws(
          () => sanitizePath('/tmp/file\u00A0.txt'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects newline characters', () => {
        assert.throws(
          () => sanitizePath('/tmp/file\n.txt'),
          /Invalid input: path contains invalid characters/
        );
      });

      test('rejects non-string input', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizePath(123),
          /Invalid input: path must be a string/
        );
      });
    });
  });

  suite('sanitizeExecutablePath', () => {
    suite('valid inputs', () => {
      test('accepts simple executable name', () => {
        assert.strictEqual(sanitizeExecutablePath('node'), 'node');
      });

      test('accepts executable with extension', () => {
        assert.strictEqual(sanitizeExecutablePath('node.exe'), 'node.exe');
      });

      test('accepts relative executable path', () => {
        assert.strictEqual(sanitizeExecutablePath('./bin/node'), './bin/node');
      });

      test('accepts nested relative executable path', () => {
        assert.strictEqual(sanitizeExecutablePath('./dist/bin/node.exe'), './dist/bin/node.exe');
      });

      test('accepts Windows-style executable path', () => {
        assert.strictEqual(sanitizeExecutablePath('.\\bin\\node.exe'), '.\\bin\\node.exe');
      });

      test('accepts absolute Unix path', () => {
        assert.strictEqual(sanitizeExecutablePath('/usr/bin/node'), '/usr/bin/node');
      });

      test('accepts absolute Windows path', () => {
        assert.strictEqual(sanitizeExecutablePath('C:\\Program Files\\node\\node.exe'), 'C:\\Program Files\\node\\node.exe');
      });

      test('accepts executable with underscore', () => {
        assert.strictEqual(sanitizeExecutablePath('my_app.exe'), 'my_app.exe');
      });

      test('accepts empty string', () => {
        assert.strictEqual(sanitizeExecutablePath(''), '');
      });
    });

    suite('invalid inputs', () => {
      test('rejects path traversal with ../', () => {
        assert.throws(
          () => sanitizeExecutablePath('../../../usr/bin/bash'),
          /Invalid input: path traversal detected/
        );
      });

      test('rejects path traversal with ..\\', () => {
        assert.throws(
          () => sanitizeExecutablePath('..\\..\\..\\usr\\bin\\bash'),
          /Invalid input: path traversal detected/
        );
      });

      test('rejects command injection with semicolon', () => {
        assert.throws(
          () => sanitizeExecutablePath('/usr/bin/node; rm -rf /'),
          /Invalid input: executable path contains invalid characters/
        );
      });

      test('rejects command injection with dollar sign', () => {
        assert.throws(
          () => sanitizeExecutablePath('/usr/bin/$(whoami)'),
          /Invalid input: executable path contains invalid characters/
        );
      });

      test('rejects command injection with backticks', () => {
        assert.throws(
          () => sanitizeExecutablePath('/usr/bin/`whoami`'),
          /Invalid input: executable path contains invalid characters/
        );
      });

      test('rejects null byte injection', () => {
        assert.throws(
          () => sanitizeExecutablePath('/usr/bin/node\0.exe'),
          /Invalid input: executable path contains invalid characters/
        );
      });

      test('rejects pipe character', () => {
        assert.throws(
          () => sanitizeExecutablePath('/usr/bin/node|cat'),
          /Invalid input: executable path contains invalid characters/
        );
      });

      test('rejects ampersand character', () => {
        assert.throws(
          () => sanitizeExecutablePath('/usr/bin/node&cat'),
          /Invalid input: executable path contains invalid characters/
        );
      });

      test('rejects unicode tricks', () => {
        assert.throws(
          () => sanitizeExecutablePath('/usr/bin/node\u00A0.exe'),
          /Invalid input: executable path contains invalid characters/
        );
      });

      test('rejects newline characters', () => {
        assert.throws(
          () => sanitizeExecutablePath('/usr/bin/node\n.exe'),
          /Invalid input: executable path contains invalid characters/
        );
      });

      test('rejects non-string input', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeExecutablePath(123),
          /Invalid input: executable path must be a string/
        );
      });
    });
  });

  suite('sanitizeProcessId', () => {
    suite('valid inputs', () => {
      test('accepts simple numeric PID', () => {
        assert.strictEqual(sanitizeProcessId('1234'), '1234');
      });

      test('accepts single digit PID', () => {
        assert.strictEqual(sanitizeProcessId('1'), '1');
      });

      test('accepts large PID', () => {
        assert.strictEqual(sanitizeProcessId('999999999'), '999999999');
      });

      test('accepts zero', () => {
        assert.strictEqual(sanitizeProcessId('0'), '0');
      });

      test('accepts empty string', () => {
        assert.strictEqual(sanitizeProcessId(''), '');
      });
    });

    suite('invalid inputs', () => {
      test('rejects negative number (with minus sign)', () => {
        assert.throws(
          () => sanitizeProcessId('-123'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects alphanumeric string', () => {
        assert.throws(
          () => sanitizeProcessId('123abc'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects pure alphabetic string', () => {
        assert.throws(
          () => sanitizeProcessId('abc'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects string with spaces', () => {
        assert.throws(
          () => sanitizeProcessId('123 456'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects string with decimal point', () => {
        assert.throws(
          () => sanitizeProcessId('123.456'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects command injection with semicolon', () => {
        assert.throws(
          () => sanitizeProcessId('123; rm -rf /'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects command injection with dollar sign', () => {
        assert.throws(
          () => sanitizeProcessId('$(whoami)'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects command injection with backticks', () => {
        assert.throws(
          () => sanitizeProcessId('`whoami`'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects null byte injection', () => {
        assert.throws(
          () => sanitizeProcessId('123\0'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects unicode tricks', () => {
        assert.throws(
          () => sanitizeProcessId('123\u00A0'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects newline characters', () => {
        assert.throws(
          () => sanitizeProcessId('123\n'),
          /Invalid input: process ID must contain only digits/
        );
      });

      test('rejects non-string input (number)', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeProcessId(123),
          /Invalid input: process ID must be a string/
        );
      });

      test('rejects non-string input (null)', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeProcessId(null),
          /Invalid input: process ID must be a string/
        );
      });

      test('rejects non-string input (undefined)', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeProcessId(undefined),
          /Invalid input: process ID must be a string/
        );
      });

      test('rejects non-string input (object)', () => {
        assert.throws(
          // @ts-expect-error - Testing type validation
          () => sanitizeProcessId({}),
          /Invalid input: process ID must be a string/
        );
      });
    });
  });
});
