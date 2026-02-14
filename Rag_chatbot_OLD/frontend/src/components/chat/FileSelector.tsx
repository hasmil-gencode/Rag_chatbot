import { useState, useEffect } from "react";
import { FileText, X } from "lucide-react";
import { api } from "@/lib/api";

interface FileFile {
  id: string;
  name: string;
}

interface FileSelectorProps {
  selectedFileId: string | null;
  onFileSelect: (fileId: string | null) => void;
}

export const FileSelector = ({ selectedFileId, onFileSelect }: FileSelectorProps) => {
  const [files, setFiles] = useState<FileFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const data = await api.getFiles();
      setFiles(data);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const selectedFile = files.find(f => f.id === selectedFileId);

  return (
    <div className="relative">
      {selectedFile && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm mb-2">
          <FileText className="w-4 h-4" />
          <span className="flex-1 truncate">Search in: {selectedFile.name}</span>
          <button
            onClick={() => onFileSelect(null)}
            className="hover:bg-primary/20 rounded p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-muted-foreground hover:text-foreground mb-2"
      >
        {selectedFile ? 'Change file' : 'Search specific file'}
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
          <div className="p-2">
            <button
              onClick={() => {
                onFileSelect(null);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent rounded text-sm"
            >
              All files
            </button>
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => {
                  onFileSelect(file.id);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-accent rounded text-sm flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
