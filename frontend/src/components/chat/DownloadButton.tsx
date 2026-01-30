import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadFile } from "@/lib/fileHelper";

interface DownloadableFile {
  id: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
  similarity: number;
}

interface FileMatch {
  searchTerm: string;
  files: DownloadableFile[];
}

interface DownloadButtonProps {
  matches: FileMatch[];
}

export const DownloadButton = ({ matches }: DownloadButtonProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // If only one file across all matches, download directly
  const totalFiles = matches.reduce((sum, m) => sum + m.files.length, 0);
  const singleFile = totalFiles === 1 ? matches[0]?.files[0] : null;

  const handleDownload = async (fileId: string, fileName: string) => {
    setIsDownloading(true);
    setShowDropdown(false);
    
    try {
      await downloadFile(fileId);
      toast.success(`Downloaded: ${fileName}`);
    } catch (error: any) {
      toast.error(error.message || 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  if (totalFiles === 0) return null;

  // Single file - direct download button
  if (singleFile) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleDownload(singleFile.id, singleFile.name)}
        disabled={isDownloading}
        className="gap-2"
      >
        {isDownloading ? (
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {isDownloading ? 'Downloading...' : 'Download'}
      </Button>
    );
  }

  // Multiple files - dropdown
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isDownloading}
        className="gap-2"
      >
        <Download className="w-4 h-4" />
        Download ({totalFiles})
        <ChevronDown className="w-3 h-3" />
      </Button>

      {showDropdown && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDropdown(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-popover border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
                Select file to download:
              </div>
              {matches.map((match, idx) => (
                <div key={idx} className="mb-2">
                  {match.files.length > 1 && (
                    <div className="text-xs text-muted-foreground px-2 py-1">
                      Matches for "{match.searchTerm}":
                    </div>
                  )}
                  {match.files.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => handleDownload(file.id, file.name)}
                      disabled={isDownloading}
                      className="w-full text-left px-3 py-2 hover:bg-accent rounded-md transition-colors disabled:opacity-50"
                    >
                      <div className="font-medium text-sm truncate">{file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Uploaded by {file.uploadedBy} • {new Date(file.uploadedAt).toLocaleDateString()}
                        {file.similarity < 1 && (
                          <span className="ml-1">• {Math.round(file.similarity * 100)}% match</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
