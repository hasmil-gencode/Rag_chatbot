/**
 * Parse file names from bot message
 * Matches patterns:
 * 1. *filename.pdf* or **filename.pdf**
 * 2. "filename.pdf"
 * 3. filename.pdf (with common extensions)
 */
export function parseFileNamesFromMessage(message: string): string[] {
  if (!message || typeof message !== 'string') return [];
  
  const patterns = [
    /\*{1,2}([^*]+\.(pdf|docx|xlsx|txt|doc|xls|ppt|pptx))\*{1,2}/gi,
    /"([^"]+\.(pdf|docx|xlsx|txt|doc|xls|ppt|pptx))"/gi,
    /\b([A-Z][a-zA-Z0-9\s\-_]+\.(pdf|docx|xlsx|txt|doc|xls|ppt|pptx))\b/g
  ];
  
  const matches = new Set<string>();
  
  for (const pattern of patterns) {
    const found = [...message.matchAll(pattern)];
    found.forEach(m => matches.add(m[1].trim()));
  }
  
  return Array.from(matches);
}

/**
 * Check if files are downloadable
 */
export async function checkDownloadableFiles(fileNames: string[]) {
  if (!fileNames || fileNames.length === 0) return [];
  
  const response = await fetch('/api/files/check-downloadable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ fileNames })
  });
  
  if (!response.ok) throw new Error('Failed to check files');
  return response.json();
}

/**
 * Download file
 */
export async function downloadFile(fileId: string) {
  const response = await fetch(`/api/files/${fileId}/download`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  
  if (!response.ok) throw new Error('Download failed');
  
  const { downloadUrl, fileName } = await response.json();
  
  // Trigger download
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  return fileName;
}
