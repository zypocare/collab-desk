// A real Excel file (.xlsx), built in the browser: one sheet per table, a bold header row, numbers as
// numbers and dates as text Excel recognises. An .xlsx is a zip of small XML files, so it reuses the
// app's own zip writer; no library needed.
import { zip } from './exportAll';

export type Sheet = { name: string; rows: (string | number | null | undefined)[][] };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
// Column letters: 0 → A, 26 → AA.
const col = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : col(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
// Excel sheet names: up to 31 characters, none of : \ / ? * [ ].
const sheetName = (s: string) => s.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet';

function sheetXml(rows: Sheet['rows']) {
	const width = Math.max(1, ...rows.map((r) => r.length));
	const cols = Array.from({ length: width }, (_, c) => {
		const w = Math.min(60, Math.max(10, ...rows.map((r) => String(r[c] ?? '').length + 2)));
		return `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
	}).join('');
	const body = rows
		.map((r, ri) => {
			const cells = r
				.map((v, ci) => {
					if (v === null || v === undefined || v === '') return '';
					const ref = `${col(ci)}${ri + 1}`;
					const style = ri === 0 ? ' s="1"' : '';
					if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
					return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
				})
				.join('');
			return `<row r="${ri + 1}">${cells}</row>`;
		})
		.join('');
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

/** One .xlsx file with a sheet per table. */
export function xlsx(sheets: Sheet[]): Blob {
	const names = sheets.map((s, i) => {
		let n = sheetName(s.name);
		// Names must be unique.
		while (sheets.slice(0, i).some((x) => sheetName(x.name) === n)) n = `${n.slice(0, 28)} ${i}`;
		return n;
	});
	const files = [
		{
			name: '[Content_Types].xml',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`
		},
		{
			name: '_rels/.rels',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
		},
		{
			name: 'xl/workbook.xml',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
		},
		{
			name: 'xl/_rels/workbook.xml.rels',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
		},
		{
			// Style 1: the bold header row.
			name: 'xl/styles.xml',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
		},
		...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s.rows) }))
	];
	return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
