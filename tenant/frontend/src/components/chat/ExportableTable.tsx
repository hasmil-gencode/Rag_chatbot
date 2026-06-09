import { useState, useRef } from "react";
import { Download, Maximize2, Minimize2 } from "lucide-react";
import * as XLSX from "xlsx";

interface ExportableTableProps {
  children: React.ReactNode;
}

export function ExportableTable({ children }: ExportableTableProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const extractFromDOM = (): { headers: string[]; rows: string[][] } => {
    if (!tableRef.current) return { headers: [], rows: [] };
    const headers: string[] = [];
    const rows: string[][] = [];
    const ths = tableRef.current.querySelectorAll('thead th');
    ths.forEach(th => headers.push(th.textContent || ''));
    const trs = tableRef.current.querySelectorAll('tbody tr');
    trs.forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('td').forEach(td => cells.push(td.textContent || ''));
      if (cells.length) rows.push(cells);
    });
    return { headers, rows };
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    const { headers, rows } = extractFromDOM();
    if (headers.length === 0 && rows.length === 0) return;
    const data = [headers, ...rows];

    if (format === 'csv') {
      const csv = data.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, 'table-export.csv');
    } else {
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      downloadBlob(blob, 'table-export.xlsx');
    }
    setShowMenu(false);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`my-2 border rounded-lg overflow-hidden ${expanded ? 'fixed inset-4 z-50 bg-background shadow-2xl flex flex-col' : ''}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
        <span className="text-[10px] font-medium text-muted-foreground">Table</span>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-1 rounded hover:bg-muted transition-colors" title="Download">
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-popover border rounded-md shadow-lg z-10 py-1 min-w-[80px]">
                <button onClick={() => handleExport('csv')} className="w-full px-3 py-1 text-[11px] text-left hover:bg-muted">CSV</button>
                <button onClick={() => handleExport('xlsx')} className="w-full px-3 py-1 text-[11px] text-left hover:bg-muted">Excel</button>
              </div>
            )}
          </div>
          <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-muted transition-colors" title={expanded ? 'Minimize' : 'Expand'}>
            {expanded ? <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" /> : <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        </div>
      </div>
      <div className={`overflow-auto ${expanded ? 'flex-1' : 'max-h-[400px]'}`}>
        <table ref={tableRef} className="w-full text-xs border-collapse">
          {children}
        </table>
      </div>
    </div>
  );
}
