import type { ParsedRow } from "./types";

export function parseCsv(text: string): {
  headers: string[];
  rows: ParsedRow[];
} {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headers: string[] = [];
  const rows: ParsedRow[] = [];

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  let firstNonEmpty = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? "").trim()) {
      firstNonEmpty = i;
      break;
    }
  }
  if (firstNonEmpty === -1) return { headers: [], rows: [] };

  const headerLine = parseLine(lines[firstNonEmpty]!);
  headers.push(...headerLine.filter(Boolean));

  for (let i = firstNonEmpty + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const values = parseLine(line);
    const row: ParsedRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}
