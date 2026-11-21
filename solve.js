// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly csv-reader 1.0.0's answer {columns, rows, errors} for
// every input {text, header}. Same semantics, different speed: the
// reference walks the text one character at a time and builds every field
// by appending one character at a time. This parser instead scans each
// unquoted field once with a tight charCode loop to its next delimiter
// and takes the field with one slice, and scans each quoted field for
// its closing quote with a native indexOf and takes its content with
// one slice. A clean field therefore costs one short scan plus one
// slice instead of a JavaScript loop over every character, and no
// per-field object is allocated: field readers return the string and
// set the shared `ended`/`added` variables.
//
// The tricky cases, all matching the reference:
//  - U+FEFF at the very start is dropped.
//  - A record ends at LF or CRLF; a line left with no characters is no
//    record (only LF/CRLF lines are skipped at a record's start; a line
//    holding only stray CRs is read as a record, its stray_cr errors
//    kept, and then discarded because it is a single empty unquoted field).
//  - Outside quotes a CR not followed by LF is dropped (stray_cr). A CR
//    can only sit before the next comma or LF, so an unquoted field is
//    one segment up to the next comma/LF/EOF with its CRs dropped.
//  - A quoted field runs to the next quote that is not doubled; "" is
//    one quote, each CRLF or lone CR inside it reads as LF, and the
//    line count rises once per LF, CRLF or lone CR inside quotes.
//  - What follows a closing quote, up to the next comma or line break,
//    is appended as it stands (quote_junk, when anything was appended).
//    A lone CR there is a stray_cr, not a line break.
//  - A quote that never closes is a literal character and the text
//    after it is read again as unquoted (unterminated_quote), with the
//    line reset to the opening quote's line.
//  - A quote inside an unquoted field is a literal character.
//  - columns is the first record when header is true, else null (and []
//    when header is true but there is no record at all); rows are the
//    records after it, each padded (short_row, with fields: its field
//    count) or cut (long_row, with extra: the cut fields) to the first
//    record's width. Errors are {code, line, row} in the order met,
//    short_row/long_row when the record ends; line is the 1-based line
//    the record starts on, row its index in rows, null for the header.
//  - Fields stay strings, never trimmed or converted. Nothing is kept
//    from one run() call to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and the index in rows
  // it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended, and how many characters the last
  // readUnquoted call kept (its caller needs it for quote_junk).
  let ended = END;
  let added = 0;

  // One quoted segment [s, e): CR-free segments are a plain slice with
  // their LFs counted; a segment holding a CR is walked once, turning
  // each CRLF or lone CR into one LF and counting one line per break.
  function quotedSegment(s, e) {
    const seg = text.slice(s, e);
    if (seg.indexOf('\r') === -1) {
      let idx = seg.indexOf('\n');
      while (idx !== -1) {
        line += 1;
        idx = seg.indexOf('\n', idx + 1);
      }
      return seg;
    }
    let out = '';
    let start = 0;
    let i = 0;
    while (i < seg.length) {
      const c = seg.charCodeAt(i);
      if (c === 13) {
        out += seg.slice(start, i);
        out += '\n';
        line += 1;
        i += i + 1 < seg.length && seg.charCodeAt(i + 1) === 10 ? 2 : 1;
        start = i;
      } else if (c === 10) {
        out += seg.slice(start, i);
        out += '\n';
        line += 1;
        i += 1;
        start = i;
      } else {
        i += 1;
      }
    }
    out += seg.slice(start);
    return out;
  }

  // Reads unquoted characters onto `initial` up to the next comma or
  // line break, and returns the field. A CR not followed by LF is
  // dropped (stray_cr); `ended` says how the field ended.
  function readUnquoted(initial) {
    let value = initial;
    added = 0;
    for (;;) {
      let i = pos;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i += 1;
      }
      if (i >= n) {
        const seg = text.slice(pos, n);
        value += seg;
        added += seg.length;
        pos = n;
        ended = END;
        return value;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        const seg = text.slice(pos, i);
        value += seg;
        added += seg.length;
        pos = i + 1;
        ended = COMMA;
        return value;
      }
      if (c === 10) {
        const seg = text.slice(pos, i);
        value += seg;
        added += seg.length;
        pos = i + 1;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
        const seg = text.slice(pos, i);
        value += seg;
        added += seg.length;
        pos = i + 2;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      // A lone CR: drop it, record stray_cr, and keep reading the
      // same field from just past it.
      const seg = text.slice(pos, i);
      value += seg;
      added += seg.length;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos, and returns it.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let segStart = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the
        // text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        value += quotedSegment(segStart, q);
        value += '"';
        pos = q + 2;
        segStart = pos;
        continue;
      }
      value += quotedSegment(segStart, q);
      pos = q + 1;
      break;
    }
    if (pos >= n) {
      ended = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      ended = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to
    // the next comma or line break.
    const junk = readUnquoted(value);
    if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      fields.push(quoted ? readQuoted() : readUnquoted(''));
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
